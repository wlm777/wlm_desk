import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import require_role
from app.db.session import get_db
from app.models import UserRole
from app.models.user import User
from app.schemas.common import PaginatedResponse
from app.schemas.user import UserCreate, UserRead, UserUpdate
from app.services import audit as audit_service
from app.services import user as user_service

router = APIRouter()


@router.get("", response_model=PaginatedResponse[UserRead])
async def list_users(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    search: str | None = None,
    admin: User = Depends(require_role(UserRole.admin)),
    db: AsyncSession = Depends(get_db),
):
    users, total = await user_service.get_users(db, limit=limit, offset=offset, search=search)
    return PaginatedResponse(items=users, total=total, limit=limit, offset=offset)


@router.post("", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def create_user(
    data: UserCreate,
    admin: User = Depends(require_role(UserRole.admin)),
    db: AsyncSession = Depends(get_db),
):
    from app.core.password_validator import validate_password
    pw_err = validate_password(data.password)
    if pw_err:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, pw_err)
    existing = await user_service.get_user_by_email(db, data.email)
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")
    user = await user_service.create_user(db, data)
    await audit_service.log_action(
        db, "user", user.id, "created", admin.id,
        {"email": data.email, "role": data.role.value},
    )
    await db.commit()
    await db.refresh(user)
    return user


@router.get("/{user_id}", response_model=UserRead)
async def get_user(
    user_id: uuid.UUID,
    admin: User = Depends(require_role(UserRole.admin)),
    db: AsyncSession = Depends(get_db),
):
    user = await user_service.get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    return user


@router.put("/{user_id}", response_model=UserRead)
async def update_user(
    user_id: uuid.UUID,
    data: UserUpdate,
    admin: User = Depends(require_role(UserRole.admin)),
    db: AsyncSession = Depends(get_db),
):
    user = await user_service.get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    if data.slack_webhook_url and not data.slack_webhook_url.startswith("https://hooks.slack.com/"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Slack webhook URL must start with https://hooks.slack.com/")
    if data.password:
        from app.core.password_validator import validate_password
        pw_err = validate_password(data.password)
        if pw_err:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, pw_err)
    changes = audit_service.compute_diff(user, data.model_dump(exclude_unset=True))
    user = await user_service.update_user(db, user, data)
    if changes:
        await audit_service.log_action(db, "user", user.id, "updated", admin.id, {"changes": changes})
    await db.commit()
    return user


@router.patch("/{user_id}/deactivate", response_model=UserRead)
async def deactivate_user(
    user_id: uuid.UUID,
    admin: User = Depends(require_role(UserRole.admin)),
    db: AsyncSession = Depends(get_db),
):
    user = await user_service.get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    user = await user_service.deactivate_user(db, user)
    await audit_service.log_action(db, "user", user.id, "deactivated", admin.id, None)
    await db.commit()
    return user


class DeleteUserRequest(BaseModel):
    reassign_to: uuid.UUID | None = None


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: uuid.UUID,
    data: DeleteUserRequest | None = None,
    admin: User = Depends(require_role(UserRole.admin)),
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import update as sa_update
    from app.models import Task, TaskAssignee, Comment

    user = await user_service.get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    if user.id == admin.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot delete yourself")

    reassign_to = data.reassign_to if data else None

    if reassign_to:
        target = await user_service.get_user_by_id(db, reassign_to)
        if not target:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Reassign target user not found")

        # Reassign tasks created by this user
        await db.execute(
            sa_update(Task).where(Task.created_by_id == user_id).values(created_by_id=reassign_to)
        )
        # Reassign task assignments
        existing_assignee_tasks = await db.execute(
            select(TaskAssignee.task_id).where(TaskAssignee.user_id == reassign_to)
        )
        existing_task_ids = {r[0] for r in existing_assignee_tasks.all()}
        assignees = await db.execute(
            select(TaskAssignee).where(TaskAssignee.user_id == user_id)
        )
        for a in assignees.scalars().all():
            if a.task_id in existing_task_ids:
                await db.delete(a)
            else:
                a.user_id = reassign_to
        # Reassign comments
        await db.execute(
            sa_update(Comment).where(Comment.author_id == user_id).values(author_id=reassign_to)
        )
    else:
        # Just remove assignments, keep tasks/comments as-is (orphaned creator)
        assignees = await db.execute(
            select(TaskAssignee).where(TaskAssignee.user_id == user_id)
        )
        for a in assignees.scalars().all():
            await db.delete(a)

    user_name = user.full_name
    await audit_service.log_action(
        db, "user", user_id, "deleted", admin.id,
        {"name": user_name, "reassign_to": str(reassign_to) if reassign_to else None},
    )
    await db.delete(user)
    await db.commit()
