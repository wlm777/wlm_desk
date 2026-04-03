import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, require_project_access, require_role
from app.db.session import get_db
from app.models import UserRole
from app.models.user import User
from app.schemas.common import PaginatedResponse
from app.schemas.project import ProjectCreate, ProjectRead, ProjectUpdate
from app.services import audit as audit_service
from app.services import project as project_service

router = APIRouter()


@router.get("", response_model=PaginatedResponse[ProjectRead])
async def list_projects(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    include_archived: bool = False,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import func, select
    from app.models import ProjectMember, Task

    projects, total = await project_service.get_projects(
        db, user, limit=limit, offset=offset, include_archived=include_archived
    )

    # Enrich with task_count and member_count
    items = []
    for p in projects:
        data = {c.key: getattr(p, c.key) for c in p.__table__.columns}
        tc = (await db.execute(
            select(func.count()).select_from(Task).where(Task.project_id == p.id, Task.is_archived.is_(False))
        )).scalar() or 0
        mc = (await db.execute(
            select(func.count()).select_from(ProjectMember).where(ProjectMember.project_id == p.id)
        )).scalar() or 0
        data["task_count"] = tc
        data["member_count"] = mc
        items.append(data)

    return PaginatedResponse(items=items, total=total, limit=limit, offset=offset)


@router.post("", response_model=ProjectRead, status_code=status.HTTP_201_CREATED)
async def create_project(
    data: ProjectCreate,
    user: User = Depends(require_role(UserRole.admin, UserRole.manager)),
    db: AsyncSession = Depends(get_db),
):
    project = await project_service.create_project(db, data, user)
    await audit_service.log_action(
        db, "project", project.id, "created", user.id, {"name": data.name}
    )
    await db.commit()
    return project


@router.get("/{project_id}", response_model=ProjectRead)
async def get_project(
    project_id: uuid.UUID,
    user: User = Depends(require_project_access),
    db: AsyncSession = Depends(get_db),
):
    project = await project_service.get_project(db, project_id)
    if not project:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
    return project


@router.put("/{project_id}", response_model=ProjectRead)
async def update_project(
    project_id: uuid.UUID,
    data: ProjectUpdate,
    user: User = Depends(require_project_access),
    db: AsyncSession = Depends(get_db),
):
    project = await project_service.get_project(db, project_id)
    if not project:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    if project.is_archived:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Project is archived")
    changes = audit_service.compute_diff(project, data.model_dump(exclude_unset=True))
    project = await project_service.update_project(db, project, data)
    if changes:
        await audit_service.log_action(db, "project", project.id, "updated", user.id, {"changes": changes})
    await db.commit()
    return project


@router.patch("/{project_id}/archive", response_model=ProjectRead)
async def archive_project(
    project_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    project = await project_service.get_project(db, project_id)
    if not project:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    # Only admin or owner can archive
    if user.role != UserRole.admin and project.owner_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only admin or project owner can archive")
    project = await project_service.archive_project(db, project)
    await audit_service.log_action(db, "project", project.id, "archived", user.id, None)
    await db.commit()
    return project


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    project = await project_service.get_project(db, project_id)
    if not project:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    if user.role != UserRole.admin and project.owner_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only admin or project owner can delete")
    project_name = project.name
    await db.delete(project)
    await audit_service.log_action(
        db, "project", project_id, "deleted", user.id, {"name": project_name}
    )
    await db.commit()
    # Clean up attachment files
    from app.services.attachment import delete_project_files
    delete_project_files(project_id)
