import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import _check_task_edit, check_task_access, get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.task_subtask import SubtaskCreate, SubtaskRead, SubtaskReorder, SubtaskUpdate
from app.services import audit as audit_service
from app.services import task as task_service
from app.services import task_subtask as subtask_service

router = APIRouter()


@router.get("/tasks/{task_id}/subtasks", response_model=list[SubtaskRead])
async def list_subtasks(
    task_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    task = await task_service.get_task(db, task_id)
    if not task:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    await check_task_access(task, user, db)
    return await subtask_service.get_subtasks(db, task_id)


@router.post("/tasks/{task_id}/subtasks", response_model=SubtaskRead, status_code=status.HTTP_201_CREATED)
async def create_subtask(
    task_id: uuid.UUID,
    data: SubtaskCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    task = await task_service.get_task(db, task_id)
    if not task:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    await _check_task_edit(task, user, db)
    subtask = await subtask_service.create_subtask(db, task_id, data)
    await task_service.touch_task_activity(db, task, user.id)
    await audit_service.log_action(
        db, "subtask", subtask.id, "created", user.id,
        {"task_id": str(task_id), "title": data.title},
    )
    await db.commit()

    # Slack: notify assignees + watchers
    from app.services import slack_notify
    from app.models import Project
    from app.services import task_assignee as asn_svc, task_watcher as w_svc
    project = await db.get(Project, task.project_id)
    assignees = await asn_svc.get_assignees(db, task_id)
    watcher_ids = await w_svc.get_watcher_user_ids(db, task_id)
    target_ids = list({a.user_id for a in assignees} | set(watcher_ids) | {task.created_by_id})
    await slack_notify.notify_users(
        db, target_ids, "subtask", task.title,
        project.name if project else "", user.full_name,
        actor_id=user.id, project_id=task.project_id, task_id=task_id,
        detail=f"Added: {data.title}",
    )

    return subtask


@router.put("/subtasks/{subtask_id}", response_model=SubtaskRead)
async def update_subtask(
    subtask_id: uuid.UUID,
    data: SubtaskUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    subtask = await subtask_service.get_subtask_by_id(db, subtask_id)
    if not subtask:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    task = await task_service.get_task(db, subtask.task_id)
    if task:
        await _check_task_edit(task, user, db)
    subtask = await subtask_service.update_subtask(db, subtask, data)
    if task:
        await task_service.touch_task_activity(db, task, user.id)
    await db.commit()
    return subtask


@router.patch("/subtasks/{subtask_id}/archive", response_model=SubtaskRead)
async def archive_subtask(
    subtask_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    subtask = await subtask_service.get_subtask_by_id(db, subtask_id)
    if not subtask:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    task = await task_service.get_task(db, subtask.task_id)
    if task:
        await _check_task_edit(task, user, db)
    subtask = await subtask_service.archive_subtask(db, subtask)
    if task:
        await task_service.touch_task_activity(db, task, user.id)
    await db.commit()
    return subtask


@router.patch("/subtasks/{subtask_id}/toggle", response_model=SubtaskRead)
async def toggle_subtask(
    subtask_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    subtask = await subtask_service.get_subtask_by_id(db, subtask_id)
    if not subtask:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    task = await task_service.get_task(db, subtask.task_id)
    if task:
        await _check_task_edit(task, user, db)
    subtask = await subtask_service.toggle_subtask(db, subtask)
    if task:
        await task_service.touch_task_activity(db, task, user.id)
    await audit_service.log_action(
        db, "subtask", subtask.id,
        subtask.status.value,
        user.id, {"task_id": str(subtask.task_id), "title": subtask.title},
    )
    await db.commit()

    # Slack: notify on subtask toggle
    if task:
        from app.services import slack_notify
        from app.models import Project
        from app.services import task_assignee as asn_svc, task_watcher as w_svc
        project = await db.get(Project, task.project_id)
        assignees = await asn_svc.get_assignees(db, task.id)
        watcher_ids = await w_svc.get_watcher_user_ids(db, task.id)
        target_ids = list({a.user_id for a in assignees} | set(watcher_ids) | {task.created_by_id})
        status_label = "Completed" if subtask.status.value == "completed" else "Reopened"
        await slack_notify.notify_users(
            db, target_ids, "subtask", task.title,
            project.name if project else "", user.full_name,
            actor_id=user.id, project_id=task.project_id, task_id=task.id,
            detail=f"{status_label}: {subtask.title}",
        )

    return subtask


@router.patch("/tasks/{task_id}/subtasks/reorder", response_model=list[SubtaskRead])
async def reorder_subtasks(
    task_id: uuid.UUID,
    data: SubtaskReorder,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    task = await task_service.get_task(db, task_id)
    if not task:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    await _check_task_edit(task, user, db)
    result = await subtask_service.reorder_subtasks(db, task_id, data)
    await db.commit()
    return result
