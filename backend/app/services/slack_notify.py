"""Slack webhook notification service.

Centralized layer for sending Slack notifications via each user's
personal Incoming Webhook URL.  All sends are fire-and-forget:
failures are logged but never propagate to the caller.
"""

import logging
import uuid
from datetime import datetime, timezone as tz
from zoneinfo import ZoneInfo

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.user import User

logger = logging.getLogger(__name__)


def _is_working_day(user: User) -> bool:
    """Check if today is a working day for the user (in their timezone)."""
    try:
        user_tz = ZoneInfo(user.timezone)
    except Exception:
        user_tz = ZoneInfo("UTC")
    local_now = datetime.now(user_tz)
    # isoweekday: 1=Mon, 7=Sun
    today_dow = str(local_now.isoweekday())
    working = {d.strip() for d in (user.working_days or "1,2,3,4,5").split(",") if d.strip()}
    return today_dow in working

# ── Preference field names mapped to event types ──
EVENT_PREF_MAP: dict[str, str] = {
    "comment": "notify_comment",
    "task_created": "notify_task_created",
    "task_updated": "notify_task_updated",
    "watcher": "notify_watcher",
    "task_assigned": "notify_task_assigned",
    "file_upload": "notify_file_upload",
    "subtask": "notify_subtask",
}

# ── Priority / status display helpers ──
_PRIORITY_EMOJI = {"urgent": ":red_circle:", "high": ":large_orange_circle:", "medium": ":large_yellow_circle:", "low": ":large_green_circle:", "none": ":white_circle:"}
_PRIORITY_LABEL = {"urgent": "Urgent", "high": "High", "medium": "Medium", "low": "Low", "none": "None"}
_STATUS_EMOJI = {"no_progress": ":white_circle:", "in_progress": ":small_orange_diamond:", "completed": ":white_check_mark:"}
_STATUS_LABEL = {"no_progress": "To Do", "in_progress": "In Progress", "completed": "Completed"}


def _task_link(task_title: str, project_id: str | uuid.UUID, task_id: str | uuid.UUID) -> str:
    """Build a clickable Slack link to the task."""
    url = f"{settings.frontend_url}/projects/{project_id}?task={task_id}"
    return f"<{url}|{task_title}>"


def _format_change_detail(changes: dict) -> str:
    """Format structured changes dict into human-readable Slack lines."""
    lines: list[str] = []
    for field, vals in changes.items():
        if not isinstance(vals, list) or len(vals) != 2:
            continue
        old_val, new_val = vals

        if field in ("description_rich", "description_plain"):
            # Show first 10 words of new description
            if field == "description_plain" and new_val:
                words = str(new_val).split()[:10]
                preview = " ".join(words)
                if len(str(new_val).split()) > 10:
                    preview += "..."
                lines.append(f"Description: _{preview}_")
            elif field == "description_rich":
                if "description_plain" not in changes:
                    lines.append("Description updated")
            continue

        if field == "priority":
            emoji = _PRIORITY_EMOJI.get(str(new_val), "")
            label = _PRIORITY_LABEL.get(str(new_val), str(new_val))
            lines.append(f"Priority: {emoji} {label}")
            continue

        if field == "status":
            emoji = _STATUS_EMOJI.get(str(new_val), "")
            label = _STATUS_LABEL.get(str(new_val), str(new_val))
            lines.append(f"Status: {emoji} {label}")
            continue

        if field == "due_date":
            lines.append(f"Due date: {new_val or 'removed'}")
            continue

        if field == "title":
            lines.append(f"Renamed: _{old_val}_ → _{new_val}_")
            continue

        if field in ("updated_at", "updated_by_id", "last_activity_at", "sort_order", "is_completed"):
            continue

        lines.append(f"{field}: {new_val}")

    return "\n".join(lines)


async def _post_webhook(url: str, payload: dict) -> bool:
    """POST a JSON payload to a Slack Incoming Webhook. Returns True on success."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(url, json=payload)
            if resp.status_code != 200:
                logger.warning("Slack webhook returned %s for %s", resp.status_code, url[:60])
                return False
            return True
    except Exception:
        logger.exception("Slack webhook POST failed for %s", url[:60])
        return False


_SLACK_PRIORITY_LABEL = {
    "high": ":sos: High Priority",
    "medium": ":rocket: Medium Priority",
    "low": ":pea_pod: Low Priority",
}


def _build_message(
    event_type: str,
    task_title: str,
    project_name: str,
    actor_name: str,
    project_id: str | uuid.UUID | None = None,
    task_id: str | uuid.UUID | None = None,
    detail: str | None = None,
    changes: dict | None = None,
    task_priority: str | None = None,
) -> dict:
    """Build a Slack message payload for Incoming Webhooks."""
    # Task title as link if IDs provided
    if project_id and task_id:
        task_display = _task_link(task_title, project_id, task_id)
    else:
        task_display = f"*{task_title}*"

    prefix = {
        "comment": ":speech_balloon:",
        "task_created": ":mega:",
        "task_updated": ":pencil2:",
        "watcher": ":eyes:",
        "task_assigned": ":bust_in_silhouette:",
        "file_upload": ":paperclip:",
        "subtask": ":arrow_right:",
    }.get(event_type, ":bell:")

    label = {
        "comment": "commented on",
        "task_created": "created task",
        "task_updated": "updated task",
        "watcher": "activity on watched task",
        "task_assigned": "assigned you to",
        "file_upload": "uploaded a file to",
        "subtask": "updated subtask on",
    }.get(event_type, event_type)

    text = f"{prefix} *{actor_name}* {label} {task_display} in _{project_name}_"

    # Append priority label for task-related events
    priority_tag = _SLACK_PRIORITY_LABEL.get(task_priority or "")
    if priority_tag and event_type in ("task_created", "task_assigned", "task_updated", "subtask", "comment", "file_upload", "watcher"):
        text += f" — {priority_tag}"

    # Structured changes for task_updated
    if changes and event_type == "task_updated":
        change_text = _format_change_detail(changes)
        if change_text:
            text += f"\n{change_text}"
    elif detail:
        text += f"\n{detail}"

    return {"text": text, "unfurl_links": False}


async def send_to_user(
    user: User,
    event_type: str,
    task_title: str,
    project_name: str,
    actor_name: str,
    project_id: str | uuid.UUID | None = None,
    task_id: str | uuid.UUID | None = None,
    detail: str | None = None,
    changes: dict | None = None,
    task_priority: str | None = None,
) -> None:
    """Send a Slack notification to a single user if their preferences allow it.

    On non-working days, only comment/subtask events for high-priority tasks are sent.
    """
    try:
        if not user.slack_enabled or not user.slack_webhook_url:
            return

        pref_field = EVENT_PREF_MAP.get(event_type)
        if pref_field and not getattr(user, pref_field, True):
            return

        # Working day filter: suppress on non-working days unless task is high priority
        if not _is_working_day(user):
            if task_priority != "high":
                return

        payload = _build_message(event_type, task_title, project_name, actor_name, project_id, task_id, detail, changes, task_priority)
        await _post_webhook(user.slack_webhook_url, payload)
    except Exception:
        logger.exception("send_to_user failed for user %s event %s", user.id, event_type)


async def notify_users(
    db: AsyncSession,
    user_ids: list[uuid.UUID],
    event_type: str,
    task_title: str,
    project_name: str,
    actor_name: str,
    actor_id: uuid.UUID | None = None,
    project_id: str | uuid.UUID | None = None,
    task_id: str | uuid.UUID | None = None,
    detail: str | None = None,
    changes: dict | None = None,
    task_priority: str | None = None,
) -> None:
    """Send Slack notifications to multiple users (excluding the actor)."""
    if not user_ids:
        return

    try:
        result = await db.execute(
            select(User).where(
                User.id.in_(user_ids),
                User.slack_enabled.is_(True),
                User.is_active.is_(True),
            )
        )
        users = list(result.scalars().all())

        for user in users:
            if actor_id and user.id == actor_id:
                continue
            await send_to_user(user, event_type, task_title, project_name, actor_name, project_id, task_id, detail, changes, task_priority)
    except Exception:
        logger.exception("notify_users failed for event %s", event_type)
