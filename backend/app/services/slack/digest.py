"""Daily Slack digest via user's personal Incoming Webhook."""

import logging
from datetime import date, datetime, timezone

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Project, Task, TaskAssignee, User
from app.models.enums import TaskStatus, TaskPriority
from app.models.pending_notification import PendingNotification
from app.services.slack_notify import _post_webhook, _is_working_day

_DIGEST_PRIORITY_TAG = {
    "high": " :sos:",
    "medium": " :rocket:",
    "low": " :pea_pod:",
}

_EVENT_LABEL = {
    "comment": ":speech_balloon: comment on",
    "task_created": ":mega: new task",
    "task_updated": ":pencil2: updated",
    "task_assigned": ":bust_in_silhouette: assigned to you",
    "subtask": ":arrow_right: subtask on",
    "file_upload": ":paperclip: file on",
    "watcher": ":eyes: activity on",
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


async def _query_pending_notifications(db: AsyncSession, user: User) -> list[PendingNotification]:
    """Get all pending (queued) notifications for a user."""
    result = await db.execute(
        select(PendingNotification)
        .where(PendingNotification.user_id == user.id)
        .order_by(PendingNotification.created_at.asc())
    )
    return list(result.scalars().all())


async def _clear_pending_notifications(db: AsyncSession, user: User) -> None:
    """Delete all pending notifications for a user after they've been sent."""
    await db.execute(
        delete(PendingNotification).where(PendingNotification.user_id == user.id)
    )


def _build_digest_payload(
    user_name: str,
    new_tasks: list[tuple] | None,
    in_progress: list[tuple] | None,
    pending: list[PendingNotification] | None = None,
) -> dict | None:
    """Build Slack message payload for daily digest. Returns None if empty."""
    sections: list[str] = []

    # Missed notifications from non-working days
    if pending:
        lines = ["*Missed while you were away*"]
        for pn in pending:
            label = _EVENT_LABEL.get(pn.event_type, pn.event_type)
            ptag = _DIGEST_PRIORITY_TAG.get(pn.task_priority or "", "")
            line = f"  • {label} *{pn.task_title}* — _{pn.project_name}_{ptag}"
            if pn.detail:
                line += f"\n      {pn.detail}"
            lines.append(line)
        sections.append("\n".join(lines))

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

    task_total = (len(new_tasks) if new_tasks else 0) + (len(in_progress) if in_progress else 0)
    pending_total = len(pending) if pending else 0
    parts = []
    if task_total:
        parts.append(f"{task_total} task(s)")
    if pending_total:
        parts.append(f"{pending_total} missed notification(s)")
    footer = f"\n\n_{', '.join(parts)}_" if parts else ""

    return {"text": header + body + footer}


async def send_daily_digest(db: AsyncSession, user: User) -> bool:
    """Send daily digest to a user via their Slack webhook.

    On working days, includes any queued notifications from non-working days.
    On non-working days, digest is skipped (notifications keep accumulating).

    Returns True if message was sent, False otherwise.
    """
    if not user.slack_enabled or not user.slack_webhook_url:
        return False

    # Skip digest on non-working days
    if not _is_working_day(user):
        return False

    has_any = user.notify_daily_new_tasks or user.notify_daily_in_progress

    new_tasks = await _query_new_tasks(db, user) if user.notify_daily_new_tasks else None
    in_progress = await _query_in_progress_tasks(db, user) if user.notify_daily_in_progress else None

    # Always check for pending notifications (even if daily prefs are off)
    pending = await _query_pending_notifications(db, user)

    if not has_any and not pending:
        return False

    payload = _build_digest_payload(user.full_name, new_tasks, in_progress, pending or None)
    if not payload:
        logger.info("No digest content for %s, skipping", user.email)
        return False

    success = await _post_webhook(user.slack_webhook_url, payload)
    if success:
        user.last_digest_at = datetime.now(timezone.utc)
        if pending:
            await _clear_pending_notifications(db, user)
        await db.flush()
        logger.info("Digest sent to %s (%d pending cleared)", user.email, len(pending))
    else:
        logger.warning("Digest webhook failed for %s", user.email)

    return success
