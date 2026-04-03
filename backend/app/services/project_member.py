import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ProjectMember, User


async def get_members(db: AsyncSession, project_id: uuid.UUID) -> list[ProjectMember]:
    result = await db.execute(
        select(ProjectMember)
        .where(ProjectMember.project_id == project_id)
        .order_by(ProjectMember.added_at)
    )
    return list(result.scalars().all())


async def add_member(
    db: AsyncSession, project_id: uuid.UUID, user_id: uuid.UUID
) -> ProjectMember:
    member = ProjectMember(project_id=project_id, user_id=user_id)
    db.add(member)
    await db.flush()
    return member


async def remove_member(db: AsyncSession, member: ProjectMember) -> None:
    await db.delete(member)
    await db.flush()


async def get_member(
    db: AsyncSession, project_id: uuid.UUID, user_id: uuid.UUID
) -> ProjectMember | None:
    result = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_id,
        )
    )
    return result.scalar_one_or_none()
