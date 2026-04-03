import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import _check_task_edit, check_task_access, get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.task_assignee import TaskAssigneeAdd, TaskAssigneeRead
from app.services import audit as audit_service
from app.services import notification as notif_service
from app.services import task as task_service
from app.services import task_assignee as assignee_service
from app.services import user as user_service

router = APIRouter()


@router.get("/tasks/{task_id}/assignees", response_model=list[TaskAssigneeRead])
async def list_assignees(
    task_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    task = await task_service.get_task(db, task_id)
    if not task:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    await check_task_access(task, user, db)
    return await assignee_service.get_assignees(db, task_id)


@router.post("/tasks/{task_id}/assignees", response_model=TaskAssigneeRead, status_code=status.HTTP_201_CREATED)
async def assign_user(
    task_id: uuid.UUID,
    data: TaskAssigneeAdd,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    task = await task_service.get_task(db, task_id)
    if not task:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Task not found")
    await _check_task_edit(task, user, db)

    # Check target user exists and is active
    target = await user_service.get_user_by_id(db, data.user_id)
    if not target or not target.is_active:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "User not found or inactive")

    existing = await assignee_service.get_assignee(db, task_id, data.user_id)
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "User already assigned")

    assignee = await assignee_service.assign_user(db, task_id, data.user_id)
    await task_service.touch_task_activity(db, task, user.id)
    await audit_service.log_action(
        db, "task", task_id, "assignee_added", user.id,
        {"user_id": str(data.user_id), "user_name": target.full_name},
    )
    # Notify assigned user (unless assigning yourself)
    if data.user_id != user.id:
        await notif_service.create_notification(
            db, data.user_id, "task_assigned",
            {"task_id": str(task_id), "project_id": str(task.project_id), "task_title": task.title, "assigned_by": user.full_name},
            dedup_key=f"{task_id}:assign:{data.user_id}",
        )
    await db.commit()

    # Slack: notify assigned user
    if data.user_id != user.id:
        from app.services import slack_notify
        from app.models import Project
        project = await db.get(Project, task.project_id)
        await slack_notify.notify_users(
            db, [data.user_id], "task_assigned", task.title,
            project.name if project else "", user.full_name,
            actor_id=user.id, project_id=task.project_id, task_id=task_id,
        )

    return assignee


@router.delete("/tasks/{task_id}/assignees/{assignee_user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def unassign_user(
    task_id: uuid.UUID,
    assignee_user_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    task = await task_service.get_task(db, task_id)
    if not task:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    await _check_task_edit(task, user, db)

    assignee = await assignee_service.get_assignee(db, task_id, assignee_user_id)
    if not assignee:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Assignee not found")

    # Resolve assignee name for audit
    target = await user_service.get_user_by_id(db, assignee_user_id)
    target_name = target.full_name if target else "Unknown"

    await assignee_service.unassign_user(db, assignee)
    await task_service.touch_task_activity(db, task, user.id)
    await audit_service.log_action(
        db, "task", task_id, "assignee_removed", user.id,
        {"user_id": str(assignee_user_id), "user_name": target_name},
    )
    await db.commit()
