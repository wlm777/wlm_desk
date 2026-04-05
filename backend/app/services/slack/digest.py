"""Daily Slack digest via user's personal Incoming Webhook."""

import logging
from datetime import date, datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Project, Task, TaskAssignee, User
from app.models.enums import TaskStatus, TaskPriority
from app.services.slack_notify import _post_webhook, _is_working_day

_DIGEST_PRIORITY_TAG = {
    "high": " :sos:",
    "medium": " :rocket:",
    "low": " :pea_pod:",
}

logger = logging.getLogger(__name__)


async def _query_new_tasks(db: AsyncSession, user: User) -> list[tuple]:
    """Tasks assigned to user that are not started (no_progress), not archived."""
    result = await db.execute(
        select(Task.title, Project.name, Task.priority)
        .join(TaskAssignee, TaskAssignee.task_id == Task.id)
        .join(Project, Project.id == Task.project_id)
        .where(
            TaskAssignee.user_id == user.id,
            Task.is_archived.is_(False),
            Task.status == TaskStatus.no_progress,
            Project.is_archived.is_(False),
        )
        .order_by(Project.name, Task.title)
    )
    return result.all()


async def _query_in_progress_tasks(db: AsyncSession, user: User) -> list[tuple]:
    """Tasks assigned to user that are in progress, not archived."""
    result = await db.execute(
        select(Task.title, Project.name, Task.priority)
        .join(TaskAssignee, TaskAssignee.task_id == Task.id)
        .join(Project, Project.id == Task.project_id)
        .where(
            TaskAssignee.user_id == user.id,
            Task.is_archived.is_(False),
            Task.status == TaskStatus.in_progress,
            Project.is_archived.is_(False),
        )
        .order_by(Project.name, Task.title)
    )
    return result.all()


def _build_digest_payload(
    user_name: str,
    new_tasks: list[tuple] | None,
    in_progress: list[tuple] | None,
) -> dict | None:
    """Build Slack message payload for daily digest. Returns None if empty."""
    sections: list[str] = []

    if new_tasks:
        lines = ["*New Tasks*"]
        for title, project_name, priority in new_tasks:
            ptag = _DIGEST_PRIORITY_TAG.get(priority.value if hasattr(priority, "value") else str(priority), "")
            lines.append(f"  • {title} — _{project_name}_{ptag}")
        sections.append("\n".join(lines))

    if in_progress:
        lines = ["*In Progress*"]
        for title, project_name, priority in in_progress:
            ptag = _DIGEST_PRIORITY_TAG.get(priority.value if hasattr(priority, "value") else str(priority), "")
            lines.append(f"  • {title} — _{project_name}_{ptag}")
        sections.append("\n".join(lines))

    if not sections:
        return None

    header = f"📋 *Daily Digest* — Good morning, {user_name}!\n"
    body = "\n\n".join(sections)
    total = (len(new_tasks) if new_tasks else 0) + (len(in_progress) if in_progress else 0)
    footer = f"\n\n_{total} task(s) total_"

    return {"text": header + body + footer}


async def send_daily_digest(db: AsyncSession, user: User) -> bool:
    """Send daily digest to a user via their Slack webhook.

    Respects per-user preferences:
    - notify_daily_new_tasks
    - notify_daily_in_progress

    Returns True if message was sent, False otherwise.
    """
    if not user.slack_enabled or not user.slack_webhook_url:
        return False

    # Skip digest on non-working days
    if not _is_working_day(user):
        return False

    has_any = user.notify_daily_new_tasks or user.notify_daily_in_progress
    if not has_any:
        return False

    new_tasks = await _query_new_tasks(db, user) if user.notify_daily_new_tasks else None
    in_progress = await _query_in_progress_tasks(db, user) if user.notify_daily_in_progress else None

    payload = _build_digest_payload(user.full_name, new_tasks, in_progress)
    if not payload:
        logger.info("No digest content for %s, skipping", user.email)
        return False

    success = await _post_webhook(user.slack_webhook_url, payload)
    if success:
        user.last_digest_at = datetime.now(timezone.utc)
        await db.flush()
        logger.info("Digest sent to %s", user.email)
    else:
        logger.warning("Digest webhook failed for %s", user.email)

    return success
