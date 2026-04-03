import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.task_watcher import TaskWatcher


async def get_watchers(db: AsyncSession, task_id: uuid.UUID) -> list[TaskWatcher]:
    result = await db.execute(
        select(TaskWatcher).where(TaskWatcher.task_id == task_id)
    )
    return list(result.scalars().all())


async def get_watcher_user_ids(db: AsyncSession, task_id: uuid.UUID) -> set[uuid.UUID]:
    result = await db.execute(
        select(TaskWatcher.user_id).where(TaskWatcher.task_id == task_id)
    )
    return set(result.scalars().all())


async def add_watcher(
    db: AsyncSession, task_id: uuid.UUID, user_id: uuid.UUID
) -> TaskWatcher:
    watcher = TaskWatcher(task_id=task_id, user_id=user_id)
    db.add(watcher)
    await db.flush()
    return watcher


async def remove_watcher(db: AsyncSession, watcher: TaskWatcher) -> None:
    await db.delete(watcher)
    await db.flush()


async def get_watcher(
    db: AsyncSession, task_id: uuid.UUID, user_id: uuid.UUID
) -> TaskWatcher | None:
    result = await db.execute(
        select(TaskWatcher).where(
            TaskWatcher.task_id == task_id,
            TaskWatcher.user_id == user_id,
        )
    )
    return result.scalar_one_or_none()
