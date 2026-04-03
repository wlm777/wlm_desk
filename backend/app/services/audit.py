import logging
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog

logger = logging.getLogger(__name__)


async def log_action(
    db: AsyncSession,
    entity_type: str,
    entity_id: uuid.UUID,
    action: str,
    actor_id: uuid.UUID,
    payload: dict | None = None,
) -> None:
    """Record an audit entry. Never raises — failures are logged and swallowed."""
    try:
        entry = AuditLog(
            entity_type=entity_type,
            entity_id=entity_id,
            action=action,
            actor_user_id=actor_id,
            payload_json=payload,
        )
        db.add(entry)
    except Exception:
        logger.exception("Failed to record audit log: %s %s %s", entity_type, entity_id, action)


def compute_diff(old_obj, update_data: dict) -> dict | None:
    """Compute meaningful diff between existing object and update data."""
    changes = {}
    for field, new_val in update_data.items():
        if new_val is None:
            continue
        old_val = getattr(old_obj, field, None)
        if old_val != new_val:
            # Convert enums to string for JSON serialization
            old_str = old_val.value if hasattr(old_val, "value") else old_val
            new_str = new_val.value if hasattr(new_val, "value") else new_val
            changes[field] = [str(old_str) if old_str is not None else None, str(new_str)]
    return changes if changes else None
