import uuid

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog
from app.models.user import User

# ── Human-readable label maps ──────────────────────────────────────────

_STATUS_LABELS: dict[str, str] = {
    "no_progress": "To Do",
    "in_progress": "In Progress",
    "completed": "Completed",
}

_PRIORITY_LABELS: dict[str, str] = {
    "low": "Low",
    "medium": "Medium",
    "high": "High",
    "urgent": "Urgent",
}

_SUBTASK_STATUS_LABELS: dict[str, str] = {
    "no_progress": "To Do",
    "in_progress": "In Progress",
    "completed": "Completed",
}

_FIELD_LABELS: dict[str, str] = {
    "status": "status",
    "priority": "priority",
    "due_date": "due date",
    "title": "title",
    "list_id": "list",
}

# Fields that should never appear in activity descriptions
_HIDDEN_FIELDS = {
    "updated_at", "updated_by_id", "last_activity_at", "created_at",
    "is_completed", "sort_order",
}

# Rich/plain description fields get collapsed into one "description" entry
_DESCRIPTION_FIELDS = {"description_rich", "description_plain"}


def _human_value(field: str, val: str | None) -> str:
    """Convert a raw DB value to a human-readable label."""
    if val is None:
        return "none"
    if field == "status":
        return _STATUS_LABELS.get(val, val)
    if field == "priority":
        return _PRIORITY_LABELS.get(val, val)
    return val


def _format_change(field: str, old_val: str | None, new_val: str | None) -> str:
    """Format a single field change as 'label from X → Y'."""
    label = _FIELD_LABELS.get(field, field)
    old_h = _human_value(field, old_val)
    new_h = _human_value(field, new_val)
    return f'{label} from "{old_h}" → "{new_h}"'


def _format_description(entity_type: str, action: str, payload: dict | None) -> str:
    """Build a human-readable description for an audit event."""

    # ── Task updates with before/after changes ──
    if entity_type == "task" and action in ("updated", "batch_updated") and payload and "changes" in payload:
        changes: dict = payload["changes"]
        parts: list[str] = []
        has_description = False

        for field, vals in changes.items():
            if field in _HIDDEN_FIELDS:
                continue
            if field in _DESCRIPTION_FIELDS:
                has_description = True
                continue
            if not isinstance(vals, list) or len(vals) != 2:
                continue
            old_val, new_val = vals

            if field == "title":
                parts.append(f'renamed task from "{old_val or ""}" → "{new_val}"')
            elif field == "list_id":
                parts.append("moved task to another list")
            else:
                parts.append(_format_change(field, old_val, new_val))

        if has_description:
            parts.append("updated description")

        if parts:
            return "; ".join(parts)
        return "updated this task"

    # ── Task created ──
    if entity_type == "task" and action == "created":
        return "created this task"

    # ── Task archived ──
    if entity_type == "task" and action == "archived":
        return "archived this task"

    # ── Assignees ──
    if entity_type == "task" and action == "assignee_added":
        name = (payload or {}).get("user_name")
        if name:
            return f'assigned {name}'
        return "assigned a user"

    if entity_type == "task" and action == "assignee_removed":
        name = (payload or {}).get("user_name")
        if name:
            return f'unassigned {name}'
        return "unassigned a user"

    # ── Subtasks ──
    if entity_type == "subtask" and action == "created":
        title = (payload or {}).get("title", "")
        if title:
            return f'added subtask "{title}"'
        return "added a subtask"

    if entity_type == "subtask" and action in _SUBTASK_STATUS_LABELS:
        title = (payload or {}).get("title", "")
        label = _SUBTASK_STATUS_LABELS[action]
        if action == "completed":
            return f'completed subtask "{title}"' if title else "completed a subtask"
        if action == "no_progress":
            return f'reopened subtask "{title}"' if title else "reopened a subtask"
        if action == "in_progress":
            return f'started subtask "{title}"' if title else "started a subtask"
        return f'changed subtask to {label}'

    # ── Comments ──
    if entity_type == "comment" and action == "created":
        return "commented on this task"

    # ── Attachments ──
    if entity_type == "attachment" and action == "uploaded":
        fname = (payload or {}).get("file_name", "")
        if fname:
            return f'uploaded file "{fname}"'
        return "uploaded a file"

    if entity_type == "attachment" and action == "deleted":
        fname = (payload or {}).get("file_name", "")
        if fname:
            return f'removed file "{fname}"'
        return "removed a file"

    # ── Fallback ──
    return f"{action} {entity_type}"


async def get_task_activity(
    db: AsyncSession,
    task_id: uuid.UUID,
    *,
    limit: int = 20,
) -> list[dict]:
    """Get activity feed for a task from AuditLog.

    Queries events where:
    - entity_type='task' AND entity_id=task_id (direct task events)
    - payload_json->>'task_id' = str(task_id) (subtask, comment, attachment events)
    """
    limit = min(limit, 100)
    task_id_str = str(task_id)

    q = (
        select(AuditLog, User.full_name)
        .join(User, User.id == AuditLog.actor_user_id, isouter=True)
        .where(
            or_(
                (AuditLog.entity_type == "task") & (AuditLog.entity_id == task_id),
                AuditLog.payload_json["task_id"].astext == task_id_str,
            )
        )
        .order_by(AuditLog.created_at.desc())
        .limit(limit)
    )

    result = await db.execute(q)
    rows = result.all()

    events = []
    for audit_log, actor_name in rows:
        events.append({
            "id": audit_log.id,
            "entity_type": audit_log.entity_type,
            "action": audit_log.action,
            "actor_name": actor_name or "Unknown",
            "description": _format_description(
                audit_log.entity_type, audit_log.action, audit_log.payload_json
            ),
            "payload": audit_log.payload_json,
            "created_at": audit_log.created_at,
        })

    return events
