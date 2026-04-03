import hashlib
import hmac
import time
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.user import UserRead
from app.services import task as task_service
from app.services import user as user_service
from app.services import task_list as list_service
from app.models.enums import TaskStatus, TaskPriority
from app.schemas.task import TaskCreate

router = APIRouter()


class SlackConnectRequest(BaseModel):
    slack_user_id: str


@router.post("/connect", response_model=UserRead)
async def connect_slack(
    data: SlackConnectRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Link current user to a Slack user ID."""
    user.slack_user_id = data.slack_user_id
    await db.flush()
    await db.refresh(user)
    await db.commit()
    return user


@router.post("/disconnect", response_model=UserRead)
async def disconnect_slack(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Unlink Slack from current user."""
    user.slack_user_id = None
    await db.flush()
    await db.refresh(user)
    await db.commit()
    return user


def _verify_slack_signature(body: bytes, timestamp: str, signature: str) -> bool:
    """Verify request came from Slack."""
    if not settings.slack_signing_secret:
        return False
    if abs(time.time() - float(timestamp)) > 300:
        return False
    sig_basestring = f"v0:{timestamp}:{body.decode()}"
    computed = "v0=" + hmac.new(
        settings.slack_signing_secret.encode(),
        sig_basestring.encode(),
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(computed, signature)


@router.post("/webhook")
async def slack_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    """Handle Slack events (slash commands, interactive messages)."""
    body = await request.body()

    # Verify Slack signature
    timestamp = request.headers.get("X-Slack-Request-Timestamp", "")
    signature = request.headers.get("X-Slack-Signature", "")
    if not _verify_slack_signature(body, timestamp, signature):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid Slack signature")

    form = await request.form()

    # URL verification challenge
    content_type = request.headers.get("content-type", "")
    if "application/json" in content_type:
        import json
        try:
            data = json.loads(body)
        except (json.JSONDecodeError, ValueError):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid JSON")
        if data.get("type") == "url_verification":
            return {"challenge": data["challenge"]}

    # Slash command: /wlm-task <title>
    command = form.get("command", "")
    text = str(form.get("text", "")).strip()
    slack_uid = str(form.get("user_id", ""))

    if command == "/wlm-task" and text:
        # Find user by slack_user_id
        from sqlalchemy import select
        result = await db.execute(
            select(User).where(User.slack_user_id == slack_uid, User.is_active.is_(True))
        )
        user = result.scalar_one_or_none()
        if not user:
            return {"response_type": "ephemeral", "text": "Your Slack account is not linked to WLM Desk."}

        # Find first project the user is a member of, use first list
        from app.models import ProjectMember, Project
        proj_result = await db.execute(
            select(Project)
            .join(ProjectMember, ProjectMember.project_id == Project.id)
            .where(ProjectMember.user_id == user.id, Project.is_archived.is_(False))
            .limit(1)
        )
        project = proj_result.scalar_one_or_none()
        if not project:
            return {"response_type": "ephemeral", "text": "You have no active projects."}

        lists = await list_service.get_lists(db, project.id)
        if not lists:
            return {"response_type": "ephemeral", "text": "No lists in your project."}

        task_data = TaskCreate(
            list_id=lists[0].id,
            title=text,
        )
        task = await task_service.create_task(db, project.id, task_data, user.id)
        await db.commit()

        return {
            "response_type": "in_channel",
            "text": f":white_check_mark: Task created: *{text}* in _{project.name}_ / _{lists[0].name}_",
        }

    return {"response_type": "ephemeral", "text": "Unknown command"}
