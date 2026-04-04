import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Project, ProjectMember, UserRole
from app.models.user import User
from app.schemas.project import ProjectCreate, ProjectUpdate


async def create_project(db: AsyncSession, data: ProjectCreate, owner: User) -> Project:
    project = Project(
        name=data.name,
        description=data.description,
        description_rich=data.description_rich,
        owner_id=owner.id,
        client_id=getattr(data, "client_id", None),
    )
    db.add(project)
    await db.flush()
    # Owner is automatically added as a member
    db.add(ProjectMember(project_id=project.id, user_id=owner.id))
    # Add additional members if provided
    added_ids = {owner.id}
    if data.member_ids:
        for uid in data.member_ids:
            if uid not in added_ids:
                db.add(ProjectMember(project_id=project.id, user_id=uid))
                added_ids.add(uid)
    # Create default task list
    from app.models.task_list import TaskList
    from app.core.colors import color_from_id
    default_list = TaskList(
        project_id=project.id,
        name="Task List",
        position=0,
        color=color_from_id(str(project.id)),
    )
    db.add(default_list)
    await db.flush()
    return project


async def get_projects(
    db: AsyncSession,
    user: User,
    *,
    limit: int = 50,
    offset: int = 0,
    include_archived: bool = False,
) -> tuple[list[Project], int]:
    limit = min(limit, 100)
    if user.role == UserRole.admin:
        q = select(Project)
        count_q = select(func.count()).select_from(Project)
    else:
        q = (
            select(Project)
            .join(ProjectMember, ProjectMember.project_id == Project.id)
            .where(ProjectMember.user_id == user.id)
        )
        count_q = (
            select(func.count())
            .select_from(Project)
            .join(ProjectMember, ProjectMember.project_id == Project.id)
            .where(ProjectMember.user_id == user.id)
        )

    if not include_archived:
        q = q.where(Project.is_archived.is_(False))
        count_q = count_q.where(Project.is_archived.is_(False))

    total = (await db.execute(count_q)).scalar() or 0
    result = await db.execute(q.order_by(Project.created_at.desc()).offset(offset).limit(limit))
    return list(result.scalars().all()), total


async def get_project(db: AsyncSession, project_id: uuid.UUID) -> Project | None:
    return await db.get(Project, project_id)


async def update_project(db: AsyncSession, project: Project, data: ProjectUpdate) -> Project:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(project, field, value)
    await db.flush()
    await db.refresh(project)
    return project


async def archive_project(db: AsyncSession, project: Project) -> Project:
    project.is_archived = True
    await db.flush()
    await db.refresh(project)
    return project
