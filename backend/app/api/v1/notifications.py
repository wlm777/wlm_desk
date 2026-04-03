import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.notification import NotificationRead
from app.services import notification as notif_service

router = APIRouter()


class NotificationsResponse(BaseModel):
    items: list[NotificationRead]
    unread_count: int


@router.get("", response_model=NotificationsResponse)
async def list_notifications(
    unread_only: bool = False,
    limit: int = Query(20, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    items = await notif_service.get_notifications(db, user.id, unread_only=unread_only, limit=limit)
    unread_count = await notif_service.get_unread_count(db, user.id)
    return NotificationsResponse(items=items, unread_count=unread_count)


@router.patch("/{notification_id}/read", status_code=status.HTTP_204_NO_CONTENT)
async def mark_notification_read(
    notification_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    success = await notif_service.mark_read(db, notification_id, user.id)
    if not success:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    await db.commit()


@router.patch("/read-all", status_code=status.HTTP_204_NO_CONTENT)
async def mark_all_read(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await notif_service.mark_all_read(db, user.id)
    await db.commit()
