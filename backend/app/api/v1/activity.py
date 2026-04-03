import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models import UserRole
from app.models.user import User
from app.schemas.activity import ActivityEvent
from app.services import activity as activity_service
from app.services import project_member as member_service
from app.services import task as task_service

router = APIRouter()


@router.get("/tasks/{task_id}/activity", response_model=list[ActivityEvent])
async def get_task_activity(
    task_id: uuid.UUID,
    limit: int = Query(20, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    task = await task_service.get_task(db, task_id)
    if not task:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Task not found")

    # Enforce project access
    if user.role != UserRole.admin:
        member = await member_service.get_member(db, task.project_id, user.id)
        if not member:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Not a project member")

    return await activity_service.get_task_activity(db, task_id, limit=limit)
