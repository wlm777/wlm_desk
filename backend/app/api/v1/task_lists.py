import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, require_project_access, require_project_write
from app.services import project_member as member_service
from app.db.session import get_db
from app.models import UserRole
from app.models.user import User
from app.schemas.task_list import TaskListCreate, TaskListRead, TaskListReorder, TaskListUpdate
from app.services import audit as audit_service
from app.services import task_list as list_service

router = APIRouter()


@router.get("/projects/{project_id}/lists", response_model=list[TaskListRead])
async def get_lists(
    project_id: uuid.UUID,
    user: User = Depends(require_project_access),
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import func, select
    from app.models import Task, TaskAssignee
    from app.models.enums import UserRole

    lists = await list_service.get_lists(db, project_id)
    result = []
    for tl in lists:
        data = {c.key: getattr(tl, c.key) for c in tl.__table__.columns}
        count_q = select(func.count()).select_from(Task).where(Task.list_id == tl.id, Task.is_archived.is_(False))
        # User role: only count tasks where assigned or creator
        if user.role == UserRole.user:
            count_q = count_q.where(
                (Task.created_by_id == user.id) | Task.id.in_(select(TaskAssignee.task_id).where(TaskAssignee.user_id == user.id))
            )
        tc = (await db.execute(count_q)).scalar() or 0
        data["task_count"] = tc
        result.append(data)
    return result


@router.post("/projects/{project_id}/lists", response_model=TaskListRead, status_code=status.HTTP_201_CREATED)
async def create_list(
    project_id: uuid.UUID,
    data: TaskListCreate,
    user: User = Depends(require_project_write),
    db: AsyncSession = Depends(get_db),
):
    # Only admin or manager can manage lists
    if user.role not in (UserRole.admin, UserRole.manager):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient permissions")
    task_list = await list_service.create_list(db, project_id, data)
    await audit_service.log_action(
        db, "task_list", task_list.id, "created", user.id, {"name": data.name}
    )
    await db.commit()
    await db.refresh(task_list)
    return task_list


@router.put("/lists/{list_id}", response_model=TaskListRead)
async def update_list(
    list_id: uuid.UUID,
    data: TaskListUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    task_list = await list_service.get_list_by_id(db, list_id)
    if not task_list:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    # Verify project membership
    if user.role == UserRole.admin:
        pass
    elif user.role == UserRole.manager:
        m = await member_service.get_member(db, task_list.project_id, user.id)
        if not m:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Not a project member")
    else:
        raise HTTPException(status.HTTP_403_FORBIDDEN)
    changes = audit_service.compute_diff(task_list, data.model_dump(exclude_unset=True))
    task_list = await list_service.update_list(db, task_list, data)
    if changes:
        await audit_service.log_action(db, "task_list", task_list.id, "updated", user.id, {"changes": changes})
    await db.commit()
    await db.refresh(task_list)
    return task_list


@router.patch("/lists/{list_id}/archive", response_model=TaskListRead)
async def archive_list(
    list_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    task_list = await list_service.get_list_by_id(db, list_id)
    if not task_list:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    if user.role == UserRole.admin:
        pass
    elif user.role == UserRole.manager:
        m = await member_service.get_member(db, task_list.project_id, user.id)
        if not m:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Not a project member")
    else:
        raise HTTPException(status.HTTP_403_FORBIDDEN)
    task_list = await list_service.archive_list(db, task_list)
    await audit_service.log_action(db, "task_list", task_list.id, "archived", user.id, None)
    await db.commit()
    await db.refresh(task_list)
    return task_list


class DeleteListRequest(BaseModel):
    destination_list_id: uuid.UUID | None = None


@router.delete("/lists/{list_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_list(
    list_id: uuid.UUID,
    data: DeleteListRequest | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    task_list = await list_service.get_list_by_id(db, list_id)
    if not task_list:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    if user.role == UserRole.admin:
        pass
    elif user.role == UserRole.manager:
        m = await member_service.get_member(db, task_list.project_id, user.id)
        if not m:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Not a project member")
    else:
        raise HTTPException(status.HTTP_403_FORBIDDEN)

    try:
        dest_id = data.destination_list_id if data else None
        await list_service.delete_list(db, task_list, dest_id)
        await audit_service.log_action(
            db, "task_list", list_id, "deleted", user.id,
            {"name": task_list.name, "destination_list_id": str(dest_id) if dest_id else None},
        )
        await db.commit()
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))


@router.patch("/projects/{project_id}/lists/reorder", response_model=list[TaskListRead])
async def reorder_lists(
    project_id: uuid.UUID,
    data: TaskListReorder,
    user: User = Depends(require_project_write),
    db: AsyncSession = Depends(get_db),
):
    if user.role not in (UserRole.admin, UserRole.manager):
        raise HTTPException(status.HTTP_403_FORBIDDEN)
    result = await list_service.reorder_lists(db, project_id, data)
    await db.commit()
    return result
