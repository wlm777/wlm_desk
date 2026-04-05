import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import _check_task_edit, check_task_access, get_current_user, require_project_access, require_project_write
from app.db.session import get_db
from app.models import UserRole
from app.models.enums import TaskPriority, TaskStatus
from app.models.user import User
from app.schemas.common import PaginatedResponse
from app.schemas.task import (
    BatchUpdateRequest, BatchUpdateResponse, BatchError,
    GlobalTaskRead, TaskCreate, TaskRead, TaskReorder, TaskReorderResponse, TaskUpdate,
)
from app.services import audit as audit_service
from app.services import task as task_service
from app.services import task_assignee as assignee_service
from app.services import task_list as list_service
from app.services import project_member as member_service

router = APIRouter()


@router.get("/tasks/global", response_model=PaginatedResponse[GlobalTaskRead])
async def list_tasks_global(
    task_status: TaskStatus | None = Query(None, alias="status"),
    priority: TaskPriority | None = None,
    assignee_id: str | None = Query(None),
    due_mode: str | None = Query(None),
    search: str | None = None,
    newest_first: bool = Query(False),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Cross-project task query — respects permissions."""
    from sqlalchemy import select
    from app.models import ProjectMember

    # Build accessible project IDs
    if user.role == UserRole.admin:
        accessible = None
    else:
        result = await db.execute(
            select(ProjectMember.project_id).where(ProjectMember.user_id == user.id)
        )
        accessible = {row[0] for row in result.all()}

    # Resolve assignee tokens
    resolved_assignee: uuid.UUID | None = None
    unassigned = False
    if assignee_id == "__me__":
        resolved_assignee = user.id
    elif assignee_id == "__none__":
        unassigned = True
    elif assignee_id:
        try:
            resolved_assignee = uuid.UUID(assignee_id)
        except ValueError:
            pass

    tasks, total = await task_service.get_tasks_global(
        db, accessible,
        status=task_status, priority=priority,
        assignee_id=resolved_assignee, unassigned=unassigned,
        due_mode=due_mode, search=search,
        limit=limit, offset=offset,
        newest_first=newest_first,
        viewer_id=user.id, viewer_role=user.role.value,
    )

    # Enrich with project/list names
    from app.models import Project
    from app.models.task_list import TaskList as TL

    project_cache: dict[uuid.UUID, str] = {}
    list_cache: dict[uuid.UUID, str] = {}

    items = []
    for t in tasks:
        data = await task_service.get_task_with_counts(db, t)
        # Resolve project name
        if t.project_id not in project_cache:
            p = await db.get(Project, t.project_id)
            project_cache[t.project_id] = p.name if p else ""
        # Resolve list name
        if t.list_id not in list_cache:
            tl = await db.get(TL, t.list_id)
            list_cache[t.list_id] = tl.name if tl else ""
        data["project_name"] = project_cache[t.project_id]
        data["list_name"] = list_cache[t.list_id]
        items.append(data)

    return PaginatedResponse(items=items, total=total, limit=limit, offset=offset)


@router.get("/projects/{project_id}/tasks", response_model=PaginatedResponse[TaskRead])
async def list_tasks(
    project_id: uuid.UUID,
    list_id: uuid.UUID | None = None,
    task_status: TaskStatus | None = Query(None, alias="status"),
    priority: TaskPriority | None = None,
    assignee_id: str | None = Query(None),
    due_mode: str | None = Query(None),
    search: str | None = None,
    archived: bool = Query(False),
    newest_first: bool = Query(False),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user: User = Depends(require_project_access),
    db: AsyncSession = Depends(get_db),
):
    # Resolve special assignee tokens
    resolved_assignee: uuid.UUID | None = None
    unassigned = False
    if assignee_id == "__me__":
        resolved_assignee = user.id
    elif assignee_id == "__none__":
        unassigned = True
    elif assignee_id:
        try:
            resolved_assignee = uuid.UUID(assignee_id)
        except ValueError:
            pass  # ignore invalid UUID

    tasks, total = await task_service.get_tasks(
        db, project_id,
        list_id=list_id, status=task_status, priority=priority,
        assignee_id=resolved_assignee, unassigned=unassigned,
        due_mode=due_mode, search=search,
        limit=limit, offset=offset,
        include_archived="only" if archived else False,
        newest_first=newest_first,
        viewer_id=user.id, viewer_role=user.role.value,
    )
    items = []
    for t in tasks:
        data = await task_service.get_task_with_counts(db, t, include_subtasks=True)
        items.append(data)
    return PaginatedResponse(items=items, total=total, limit=limit, offset=offset)


@router.post("/projects/{project_id}/tasks", response_model=TaskRead, status_code=status.HTTP_201_CREATED)
async def create_task(
    project_id: uuid.UUID,
    data: TaskCreate,
    user: User = Depends(require_project_write),
    db: AsyncSession = Depends(get_db),
):
    # Verify list belongs to project
    task_list = await list_service.get_list_by_id(db, data.list_id)
    if not task_list or task_list.project_id != project_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "List does not belong to this project")

    task = await task_service.create_task(db, project_id, data, user.id)
    await audit_service.log_action(
        db, "task", task.id, "created", user.id,
        {"title": data.title, "list_id": str(data.list_id), "priority": data.priority.value},
    )
    await db.commit()

    # Slack: notify only assignees about new task
    if data.assignee_ids:
        from app.services import slack_notify
        from app.models import Project
        project = await db.get(Project, project_id)
        await slack_notify.notify_users(
            db, [uid for uid in data.assignee_ids], "task_created", data.title,
            project.name if project else "", user.full_name,
            actor_id=user.id, project_id=project_id, task_id=task.id,
            task_priority=task.priority.value,
        )

    result = await task_service.get_task_with_counts(db, task)
    return result


@router.get("/tasks/{task_id}", response_model=TaskRead)
async def get_task(
    task_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    task = await task_service.get_task(db, task_id)
    if not task:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    await check_task_access(task, user, db)
    return await task_service.get_task_with_counts(db, task)


@router.put("/tasks/{task_id}", response_model=TaskRead)
async def update_task(
    task_id: uuid.UUID,
    data: TaskUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    task = await task_service.get_task(db, task_id)
    if not task:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    await _check_task_edit(task, user, db)

    # If changing list, verify it belongs to same project
    if data.list_id and data.list_id != task.list_id:
        new_list = await list_service.get_list_by_id(db, data.list_id)
        if not new_list or new_list.project_id != task.project_id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "List does not belong to this project")

    changes = audit_service.compute_diff(task, data.model_dump(exclude_unset=True))
    task = await task_service.update_task(db, task, data, user.id)
    if changes:
        await audit_service.log_action(db, "task", task.id, "updated", user.id, {"changes": changes})

    await db.commit()

    # Slack: notify assignees + watchers about task update
    if changes:
        from app.services import slack_notify
        from app.models import Project
        from app.services import task_assignee as asn_svc, task_watcher as w_svc
        project = await db.get(Project, task.project_id)
        assignees = await asn_svc.get_assignees(db, task.id)
        watcher_ids = await w_svc.get_watcher_user_ids(db, task.id)
        target_ids = list({a.user_id for a in assignees} | set(watcher_ids) | {task.created_by_id})
        await slack_notify.notify_users(
            db, target_ids, "task_updated", task.title,
            project.name if project else "", user.full_name,
            actor_id=user.id, project_id=task.project_id, task_id=task.id,
            changes=changes, task_priority=task.priority.value,
        )

    return await task_service.get_task_with_counts(db, task)


@router.patch("/tasks/{task_id}/archive", response_model=TaskRead)
async def archive_task(
    task_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    task = await task_service.get_task(db, task_id)
    if not task:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    await _check_task_edit(task, user, db)
    # User role: can only archive tasks they created
    if user.role == UserRole.user and task.created_by_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only archive tasks you created")
    task = await task_service.archive_task(db, task)
    await audit_service.log_action(db, "task", task.id, "archived", user.id, None)
    await db.commit()
    return await task_service.get_task_with_counts(db, task)


@router.patch("/tasks/{task_id}/restore", response_model=TaskRead)
async def restore_task(
    task_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    task = await task_service.get_task(db, task_id)
    if not task:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    await _check_task_edit(task, user, db)
    task.is_archived = False
    await db.flush()
    await db.refresh(task)
    await audit_service.log_action(db, "task", task.id, "restored", user.id, None)
    await db.commit()
    return await task_service.get_task_with_counts(db, task)


@router.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def permanently_delete_task(
    task_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Permanently delete a task and all related data + files. Admin/Manager only."""
    task = await task_service.get_task(db, task_id)
    if not task:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    if user.role == UserRole.user:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only admin or manager can permanently delete tasks")
    await _check_task_edit(task, user, db)

    project_id = task.project_id
    task_title = task.title

    # Delete attachment files from disk
    from app.services.attachment import get_attachments, delete_task_files
    delete_task_files(project_id, task_id)

    # Delete task (cascades to subtasks, comments, attachments, assignees, watchers)
    await db.delete(task)
    await audit_service.log_action(
        db, "task", task_id, "deleted", user.id,
        {"title": task_title, "project_id": str(project_id)},
    )
    await db.commit()


@router.patch("/tasks/reorder", response_model=TaskReorderResponse)
async def reorder_tasks(
    data: TaskReorder,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Validate: all tasks must belong to the specified list + user has project access
    project_id_checked = None
    for item in data.items:
        task = await task_service.get_task(db, item.id)
        if not task:
            raise HTTPException(status.HTTP_404_NOT_FOUND, f"Task {item.id} not found")
        if task.list_id != data.list_id:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"Task {item.id} does not belong to list {data.list_id}",
            )
        if project_id_checked is None:
            await check_task_access(task, user, db)
            project_id_checked = task.project_id
    results = await task_service.reorder_tasks(db, data)
    await db.commit()
    return TaskReorderResponse(items=results)


@router.post("/tasks/batch-update", response_model=BatchUpdateResponse)
async def batch_update_tasks(
    data: BatchUpdateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not data.task_ids:
        return BatchUpdateResponse(updated=0, skipped=0, errors=[])
    from app.core.config import settings as cfg
    if len(data.task_ids) > cfg.batch_max_tasks:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Max {cfg.batch_max_tasks} tasks per batch")

    # Load all tasks, validate same project
    tasks = []
    project_id = None
    for tid in data.task_ids:
        t = await task_service.get_task(db, tid)
        if not t:
            return BatchUpdateResponse(
                updated=0, skipped=0,
                errors=[BatchError(task_id=tid, reason="Task not found")],
            )
        if project_id is None:
            project_id = t.project_id
        elif t.project_id != project_id:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "All tasks must belong to the same project",
            )
        tasks.append(t)

    # If list_id changes, validate it belongs to the same project
    dest_list = None
    if data.changes.list_id:
        dest_list = await list_service.get_list_by_id(db, data.changes.list_id)
        if not dest_list or dest_list.project_id != project_id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Destination list not in same project")

    # Pre-compute sort_order for list moves
    dest_sort_base = None
    if dest_list:
        from sqlalchemy import func as sa_func, select as sa_select
        from app.models import Task as TaskModel
        result = await db.execute(
            sa_select(sa_func.coalesce(sa_func.max(TaskModel.sort_order), 0))
            .where(TaskModel.list_id == dest_list.id, TaskModel.is_archived.is_(False))
        )
        dest_sort_base = (result.scalar() or 0) + 1000

    updated = 0
    skipped = 0
    errors: list[BatchError] = []

    for i, task in enumerate(tasks):
        # Permission check per task
        try:
            await _check_task_edit(task, user, db)
        except HTTPException:
            errors.append(BatchError(task_id=task.id, reason="Permission denied"))
            skipped += 1
            continue

        # Build per-task update
        update_fields: dict = {}
        if data.changes.status is not None:
            update_fields["status"] = data.changes.status
        if data.changes.priority is not None:
            update_fields["priority"] = data.changes.priority
        if data.changes.list_id is not None:
            update_fields["list_id"] = data.changes.list_id
            update_fields["sort_order"] = dest_sort_base + (i * 1000)

        if update_fields:
            changes = audit_service.compute_diff(task, update_fields)
            task_update = TaskUpdate(**{k: v for k, v in update_fields.items()})
            await task_service.update_task(db, task, task_update, user.id)
            if changes:
                await audit_service.log_action(
                    db, "task", task.id, "batch_updated", user.id,
                    {"changes": changes, "task_id": str(task.id)},
                )

        # Handle assignee changes — validate each target user
        if data.changes.assignee_ids is not None:
            current = await assignee_service.get_assignees(db, task.id)
            current_ids = {a.user_id for a in current}
            target_ids = set(data.changes.assignee_ids)

            from app.services import user as user_svc
            for uid in target_ids - current_ids:
                target_user = await user_svc.get_user_by_id(db, uid)
                if not target_user or not target_user.is_active:
                    errors.append(BatchError(task_id=task.id, reason=f"Assignee {uid} not found or inactive"))
                    continue
                m = await member_service.get_member(db, project_id, uid)
                if not m:
                    errors.append(BatchError(task_id=task.id, reason=f"Assignee {uid} is not a project member"))
                    continue
                await assignee_service.assign_user(db, task.id, uid)
            for a in current:
                if a.user_id not in target_ids:
                    await assignee_service.unassign_user(db, a)

        updated += 1

    await db.commit()
    return BatchUpdateResponse(updated=updated, skipped=skipped, errors=errors)
