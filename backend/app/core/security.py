from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return _pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return _pwd_context.verify(plain, hashed)


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError:
        return None


def create_preview_token(attachment_id: str) -> str:
    """Create a short-lived token for unauthenticated image preview.
    Uses a separate secret from the main auth JWT."""
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.preview_token_expire_minutes)
    return jwt.encode(
        {"sub": attachment_id, "type": "preview", "exp": expire},
        settings.preview_token_secret,
        algorithm=settings.jwt_algorithm,
    )


def verify_preview_token(token: str) -> str | None:
    """Verify preview token and return attachment_id, or None."""
    try:
        payload = jwt.decode(token, settings.preview_token_secret, algorithms=[settings.jwt_algorithm])
        if payload.get("type") != "preview":
            return None
        return payload.get("sub")
    except JWTError:
        return None
