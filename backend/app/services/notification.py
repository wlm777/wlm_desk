import logging
import uuid

from sqlalchemy import and_, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification

logger = logging.getLogger(__name__)


async def create_notification(
    db: AsyncSession,
    user_id: uuid.UUID,
    type: str,
    payload: dict | None = None,
    *,
    dedup_key: str | None = None,
) -> None:
    """Create a notification. Never raises.

    Args:
        dedup_key: If provided, skip creation if a notification with the same
                   user_id, type, and dedup_key already exists (regardless of
                   is_read state). This ensures at most one notification per
                   dedup_key per user.
    """
    try:
        if dedup_key:
            existing = await db.execute(
                select(Notification.id).where(
                    Notification.user_id == user_id,
                    Notification.type == type,
                    Notification.payload["_dedup"].astext == dedup_key,
                )
            )
            if existing.scalar_one_or_none() is not None:
                return

        final_payload = dict(payload) if payload else {}
        if dedup_key:
            final_payload["_dedup"] = dedup_key

        n = Notification(user_id=user_id, type=type, payload=final_payload)
        db.add(n)
    except Exception:
        logger.exception("Failed to create notification for user %s", user_id)


async def get_notifications(
    db: AsyncSession,
    user_id: uuid.UUID,
    *,
    unread_only: bool = False,
    limit: int = 20,
) -> list[Notification]:
    limit = min(limit, 100)
    q = select(Notification).where(Notification.user_id == user_id)
    if unread_only:
        q = q.where(Notification.is_read.is_(False))
    result = await db.execute(
        q.order_by(Notification.created_at.desc()).limit(limit)
    )
    return list(result.scalars().all())


async def get_unread_count(db: AsyncSession, user_id: uuid.UUID) -> int:
    result = await db.execute(
        select(func.count())
        .select_from(Notification)
        .where(Notification.user_id == user_id, Notification.is_read.is_(False))
    )
    return result.scalar() or 0


async def mark_read(db: AsyncSession, notification_id: uuid.UUID, user_id: uuid.UUID) -> bool:
    result = await db.execute(
        update(Notification)
        .where(Notification.id == notification_id, Notification.user_id == user_id)
        .values(is_read=True)
    )
    await db.flush()
    return result.rowcount > 0


async def mark_all_read(db: AsyncSession, user_id: uuid.UUID) -> int:
    result = await db.execute(
        update(Notification)
        .where(Notification.user_id == user_id, Notification.is_read.is_(False))
        .values(is_read=True)
    )
    await db.flush()
    return result.rowcount
