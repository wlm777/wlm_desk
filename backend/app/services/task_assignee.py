import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.task_assignee import TaskAssignee


async def get_assignees(db: AsyncSession, task_id: uuid.UUID) -> list[TaskAssignee]:
    result = await db.execute(
        select(TaskAssignee).where(TaskAssignee.task_id == task_id)
    )
    return list(result.scalars().all())


async def assign_user(
    db: AsyncSession, task_id: uuid.UUID, user_id: uuid.UUID
) -> TaskAssignee:
    assignee = TaskAssignee(task_id=task_id, user_id=user_id)
    db.add(assignee)
    await db.flush()
    return assignee


async def unassign_user(db: AsyncSession, assignee: TaskAssignee) -> None:
    await db.delete(assignee)
    await db.flush()


async def get_assignee(
    db: AsyncSession, task_id: uuid.UUID, user_id: uuid.UUID
) -> TaskAssignee | None:
    result = await db.execute(
        select(TaskAssignee).where(
            TaskAssignee.task_id == task_id,
            TaskAssignee.user_id == user_id,
        )
    )
    return result.scalar_one_or_none()


async def is_task_assignee(
    db: AsyncSession, task_id: uuid.UUID, user_id: uuid.UUID
) -> bool:
    return await get_assignee(db, task_id, user_id) is not None
