import secrets
import time
from collections import defaultdict
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status

# Simple in-memory rate limiter for login: max 5 attempts per IP per 60 seconds
_login_attempts: dict[str, list[float]] = defaultdict(list)
_LOGIN_MAX = 5
_LOGIN_WINDOW = 60
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.deps import get_current_user
from app.core.security import create_access_token, hash_password, verify_password
from app.db.session import get_db
from app.models.user import User
from app.models.enums import UserRole
from app.schemas.auth import LoginRequest, TokenResponse
from app.schemas.user import ProfileUpdate, UserCreate, UserRead
from app.services import user as user_service

router = APIRouter()

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"


@router.post("/login", response_model=TokenResponse)
async def login(data: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)):
    # Rate limit by IP
    ip = request.client.host if request.client else "unknown"
    now = time.time()
    _login_attempts[ip] = [t for t in _login_attempts[ip] if now - t < _LOGIN_WINDOW]
    if len(_login_attempts[ip]) >= _LOGIN_MAX:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many login attempts. Try again later.")
    _login_attempts[ip].append(now)

    user = await user_service.get_user_by_email(db, data.email)
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Account is deactivated")
    # Update last login
    from datetime import datetime, timezone as tz
    user.last_login_at = datetime.now(tz.utc)
    await db.commit()

    token = create_access_token({"sub": str(user.id), "role": user.role.value})
    return TokenResponse(access_token=token)


@router.get("/me", response_model=UserRead)
async def me(user: User = Depends(get_current_user)):
    return user


@router.put("/me", response_model=UserRead)
async def update_me(
    data: ProfileUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update current user's own profile."""
    update_data = data.model_dump(exclude_unset=True)
    # Validate email uniqueness
    new_email = update_data.get("email")
    if new_email and new_email != user.email:
        from app.services import user as user_service
        existing = await user_service.get_user_by_email(db, new_email)
        if existing:
            raise HTTPException(status.HTTP_409_CONFLICT, "Email already in use")
    # Validate Slack webhook URL
    webhook = update_data.get("slack_webhook_url")
    if webhook and not webhook.startswith("https://hooks.slack.com/"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Slack webhook URL must start with https://hooks.slack.com/")
    if "password" in update_data and update_data["password"]:
        from app.core.password_validator import validate_password
        pw_err = validate_password(update_data["password"])
        if pw_err:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, pw_err)
        user.password_hash = hash_password(update_data.pop("password"))
    for field, value in update_data.items():
        setattr(user, field, value)
    await db.flush()
    await db.refresh(user)
    await db.commit()
    return user


@router.post("/me/test-slack")
async def test_slack_notification(
    user: User = Depends(get_current_user),
):
    """Send a test message to the user's Slack webhook."""
    if not user.slack_enabled or not user.slack_webhook_url:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Slack is not enabled or webhook URL is missing")
    from app.services.slack_notify import _post_webhook
    success = await _post_webhook(user.slack_webhook_url, {
        "text": f"🔔 *Test notification* — Hi {user.full_name}, your Slack webhook is working! (WLM Desk)",
    })
    if not success:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Webhook call failed — check URL")
    return {"ok": True}


# --- Google OAuth2 ---

@router.get("/google/login")
async def google_login():
    """Redirect user to Google OAuth consent screen."""
    if not settings.google_client_id:
        raise HTTPException(status.HTTP_501_NOT_IMPLEMENTED, "Google OAuth not configured")
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": settings.google_redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
        "state": secrets.token_urlsafe(16),
    }
    return RedirectResponse(f"{GOOGLE_AUTH_URL}?{urlencode(params)}")


@router.get("/google/callback")
async def google_callback(code: str, db: AsyncSession = Depends(get_db)):
    """Handle Google OAuth callback. Returns redirect to frontend with JWT."""
    if not settings.google_client_id or not settings.google_client_secret:
        raise HTTPException(status.HTTP_501_NOT_IMPLEMENTED, "Google OAuth not configured")

    # Exchange code for token
    try:
        async with httpx.AsyncClient() as client:
            token_resp = await client.post(
                GOOGLE_TOKEN_URL,
                data={
                    "code": code,
                    "client_id": settings.google_client_id,
                    "client_secret": settings.google_client_secret,
                    "redirect_uri": settings.google_redirect_uri,
                    "grant_type": "authorization_code",
                },
                timeout=10,
            )
    except (httpx.TimeoutException, httpx.RequestError):
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Google OAuth token exchange failed")

    if token_resp.status_code != 200:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Failed to exchange code for token")

    try:
        token_data = token_resp.json()
    except ValueError:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Invalid response from Google")

    access_token = token_data.get("access_token")
    if not access_token:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No access token in response")

    # Get user info
    try:
        async with httpx.AsyncClient() as client:
            userinfo_resp = await client.get(
                GOOGLE_USERINFO_URL,
                headers={"Authorization": f"Bearer {access_token}"},
                timeout=10,
            )
    except (httpx.TimeoutException, httpx.RequestError):
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Google user info request failed")

    if userinfo_resp.status_code != 200:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Failed to get user info")

    try:
        google_user = userinfo_resp.json()
    except ValueError:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Invalid user info response")
    email = google_user.get("email")
    if not email:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No email in Google profile")

    # Find or create user
    user = await user_service.get_user_by_email(db, email)
    if user and not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Account is deactivated")

    if not user:
        # Auto-create user from Google login
        full_name = google_user.get("name", email.split("@")[0])
        user_data = UserCreate(
            full_name=full_name,
            email=email,
            password=secrets.token_urlsafe(32),  # random password, user logs in via Google
            role=UserRole.user,
        )
        user = await user_service.create_user(db, user_data)
        await db.commit()

    jwt_token = create_access_token({"sub": str(user.id), "role": user.role.value})

    # Redirect to frontend login page which handles token extraction
    return RedirectResponse(f"{settings.frontend_url}/login?token={jwt_token}")
