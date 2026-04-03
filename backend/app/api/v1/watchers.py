import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models import UserRole
from app.models.user import User
from app.schemas.task_watcher import TaskWatcherAdd, TaskWatcherRead
from app.services import project_member as member_service
from app.services import task as task_service
from app.services import task_watcher as watcher_service
from app.services import user as user_service

router = APIRouter()


async def _require_task_project_access(
    task_id: uuid.UUID, user: User, db: AsyncSession
) -> None:
    """Verify user has access to the task's project."""
    task = await task_service.get_task(db, task_id)
    if not task:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Task not found")
    if user.role == UserRole.admin:
        return
    member = await member_service.get_member(db, task.project_id, user.id)
    if not member:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not a project member")


@router.get("/tasks/{task_id}/watchers", response_model=list[TaskWatcherRead])
async def list_watchers(
    task_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_task_project_access(task_id, user, db)
    return await watcher_service.get_watchers(db, task_id)


@router.post("/tasks/{task_id}/watchers", response_model=TaskWatcherRead, status_code=status.HTTP_201_CREATED)
async def add_watcher(
    task_id: uuid.UUID,
    data: TaskWatcherAdd,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    task = await task_service.get_task(db, task_id)
    if not task:
        raise HTTPException(status.HTTP_404_NOT_FOUND)

    # Caller must have project access
    await _require_task_project_access(task_id, user, db)

    # Target user must be an active project member
    target = await user_service.get_user_by_id(db, data.user_id)
    if not target or not target.is_active:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "User not found or inactive")

    member = await member_service.get_member(db, task.project_id, data.user_id)
    if not member:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "User is not a project member")

    existing = await watcher_service.get_watcher(db, task_id, data.user_id)
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "User is already watching this task")

    watcher = await watcher_service.add_watcher(db, task_id, data.user_id)
    await db.commit()
    return watcher


@router.delete("/tasks/{task_id}/watchers/{watcher_user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_watcher(
    task_id: uuid.UUID,
    watcher_user_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    task = await task_service.get_task(db, task_id)
    if not task:
        raise HTTPException(status.HTTP_404_NOT_FOUND)

    watcher = await watcher_service.get_watcher(db, task_id, watcher_user_id)
    if not watcher:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Watcher not found")

    # Self-removal always allowed
    if watcher_user_id == user.id:
        await watcher_service.remove_watcher(db, watcher)
        await db.commit()
        return

    # Admin can remove anyone
    if user.role == UserRole.admin:
        await watcher_service.remove_watcher(db, watcher)
        await db.commit()
        return

    # Manager must be a member of this specific project
    if user.role == UserRole.manager:
        caller_member = await member_service.get_member(db, task.project_id, user.id)
        if caller_member:
            await watcher_service.remove_watcher(db, watcher)
            await db.commit()
            return

    raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient permissions")
