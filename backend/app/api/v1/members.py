import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, require_project_access, require_project_write
from app.db.session import get_db
from app.models import UserRole
from app.models.user import User
from app.schemas.project_member import ProjectMemberAdd, ProjectMemberRead, ProjectMemberWithUser
from app.services import audit as audit_service
from app.services import project as project_service
from app.services import project_member as member_service
from app.services import user as user_service

router = APIRouter()


@router.get("/{project_id}/members", response_model=list[ProjectMemberWithUser])
async def list_members(
    project_id: uuid.UUID,
    user: User = Depends(require_project_access),
    db: AsyncSession = Depends(get_db),
):
    members = await member_service.get_members(db, project_id)
    result = []
    for m in members:
        u = await user_service.get_user_by_id(db, m.user_id)
        result.append(ProjectMemberWithUser(
            id=m.id, project_id=m.project_id, user_id=m.user_id,
            added_at=m.added_at,
            full_name=u.full_name if u else "Unknown",
            email=u.email if u else "",
            color=u.color if u else None,
        ))
    return result


@router.post("/{project_id}/members", response_model=ProjectMemberRead, status_code=status.HTTP_201_CREATED)
async def add_member(
    project_id: uuid.UUID,
    data: ProjectMemberAdd,
    user: User = Depends(require_project_write),
    db: AsyncSession = Depends(get_db),
):
    # Only admin or manager can add members
    if user.role not in (UserRole.admin, UserRole.manager):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient permissions")

    project = await project_service.get_project(db, project_id)
    if not project:
        raise HTTPException(status.HTTP_404_NOT_FOUND)

    # Cannot re-add owner
    if data.user_id == project.owner_id:
        raise HTTPException(status.HTTP_409_CONFLICT, "Owner is already a member")

    # Check user exists and is active
    target_user = await user_service.get_user_by_id(db, data.user_id)
    if not target_user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    if not target_user.is_active:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot add inactive user as member")

    # Check not already a member
    existing = await member_service.get_member(db, project_id, data.user_id)
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "User is already a member")

    member = await member_service.add_member(db, project_id, data.user_id)
    await audit_service.log_action(
        db, "project", project_id, "member_added", user.id,
        {"user_id": str(data.user_id)},
    )
    await db.commit()
    return member


@router.delete("/{project_id}/members/{member_user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(
    project_id: uuid.UUID,
    member_user_id: uuid.UUID,
    user: User = Depends(require_project_write),
    db: AsyncSession = Depends(get_db),
):
    if user.role not in (UserRole.admin, UserRole.manager):
        raise HTTPException(status.HTTP_403_FORBIDDEN)

    project = await project_service.get_project(db, project_id)
    if not project:
        raise HTTPException(status.HTTP_404_NOT_FOUND)

    # Cannot remove owner
    if member_user_id == project.owner_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot remove project owner")

    member = await member_service.get_member(db, project_id, member_user_id)
    if not member:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Member not found")

    await member_service.remove_member(db, member)
    await audit_service.log_action(
        db, "project", project_id, "member_removed", user.id,
        {"user_id": str(member_user_id)},
    )
    await db.commit()
