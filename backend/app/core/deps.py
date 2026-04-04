import uuid
from datetime import datetime, timezone as tz

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_access_token
from app.db.session import get_db
from app.models import Project, ProjectMember, Task, TaskAssignee, User, UserRole

_ACTIVITY_THROTTLE_SECONDS = 300  # update last_login_at at most every 5 min

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    payload = decode_access_token(token)
    if payload is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")
    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token payload")
    user = await db.get(User, uuid.UUID(user_id))
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found or inactive")
    # Throttled last-activity update
    now = datetime.now(tz.utc)
    if user.last_login_at is None or (now - user.last_login_at).total_seconds() > _ACTIVITY_THROTTLE_SECONDS:
        user.last_login_at = now
        await db.commit()
    return user


def require_role(*roles: UserRole):
    async def checker(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient permissions")
        return user
    return checker


async def require_project_access(
    project_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> User:
    project = await db.get(Project, project_id)
    if project is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
    if user.role == UserRole.admin:
        return user
    result = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user.id,
        )
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not a project member")
    return user


async def require_project_write(
    project_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Check project access AND that the project is not archived (read-only)."""
    project = await db.get(Project, project_id)
    if project is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
    if project.is_archived:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Project is archived (read-only)")
    if user.role == UserRole.admin:
        return user
    result = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user.id,
        )
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not a project member")
    return user


async def check_task_access(
    task: Task, user: User, db: AsyncSession
) -> None:
    """Verify user can read this task (project member or admin)."""
    if user.role == UserRole.admin:
        return
    result = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == task.project_id,
            ProjectMember.user_id == user.id,
        )
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not a project member")


async def _check_task_edit(
    task: Task, user: User, db: AsyncSession
) -> None:
    """Shared logic: verify user can edit this task."""
    if user.role == UserRole.admin:
        return
    # Check project membership
    result = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == task.project_id,
            ProjectMember.user_id == user.id,
        )
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not a project member")
    if user.role == UserRole.manager:
        return
    # Regular user: must be creator or assignee
    if task.created_by_id == user.id:
        return
    assignee = await db.execute(
        select(TaskAssignee).where(
            TaskAssignee.task_id == task.id,
            TaskAssignee.user_id == user.id,
        )
    )
    if assignee.scalar_one_or_none() is None:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Can only edit tasks assigned to you or created by you",
        )
