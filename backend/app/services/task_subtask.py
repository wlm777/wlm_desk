import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import SubtaskStatus
from app.models.task_subtask import TaskSubtask
from app.schemas.task_subtask import SubtaskCreate, SubtaskReorder, SubtaskUpdate


async def get_subtasks(
    db: AsyncSession, task_id: uuid.UUID, *, include_archived: bool = False
) -> list[TaskSubtask]:
    q = select(TaskSubtask).where(TaskSubtask.task_id == task_id)
    if not include_archived:
        q = q.where(TaskSubtask.is_archived.is_(False))
    result = await db.execute(q.order_by(TaskSubtask.sort_order, TaskSubtask.created_at))
    return list(result.scalars().all())


async def create_subtask(
    db: AsyncSession, task_id: uuid.UUID, data: SubtaskCreate
) -> TaskSubtask:
    # Calculate sort_order
    result = await db.execute(
        select(func.coalesce(func.max(TaskSubtask.sort_order), 0))
        .where(TaskSubtask.task_id == task_id, TaskSubtask.is_archived.is_(False))
    )
    sort_order = (result.scalar() or 0) + 1000

    subtask = TaskSubtask(task_id=task_id, title=data.title, sort_order=sort_order)
    db.add(subtask)
    await db.flush()
    await db.refresh(subtask)
    return subtask


async def get_subtask_by_id(db: AsyncSession, subtask_id: uuid.UUID) -> TaskSubtask | None:
    return await db.get(TaskSubtask, subtask_id)


async def update_subtask(
    db: AsyncSession, subtask: TaskSubtask, data: SubtaskUpdate
) -> TaskSubtask:
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(subtask, field, value)
    # Sync is_completed with status
    if "status" in update_data:
        subtask.is_completed = subtask.status == SubtaskStatus.completed
    await db.flush()
    await db.refresh(subtask)
    return subtask


async def archive_subtask(db: AsyncSession, subtask: TaskSubtask) -> TaskSubtask:
    subtask.is_archived = True
    await db.flush()
    return subtask


async def toggle_subtask(db: AsyncSession, subtask: TaskSubtask) -> TaskSubtask:
    """Cycle status: no_progress -> in_progress -> completed -> no_progress."""
    cycle = {
        SubtaskStatus.no_progress: SubtaskStatus.in_progress,
        SubtaskStatus.in_progress: SubtaskStatus.completed,
        SubtaskStatus.completed: SubtaskStatus.no_progress,
    }
    subtask.status = cycle.get(subtask.status, SubtaskStatus.no_progress)
    subtask.is_completed = subtask.status == SubtaskStatus.completed
    await db.flush()
    await db.refresh(subtask)
    return subtask


async def reorder_subtasks(
    db: AsyncSession, task_id: uuid.UUID, data: SubtaskReorder
) -> list[TaskSubtask]:
    for item in data.items:
        s = await db.get(TaskSubtask, item.id)
        if s and s.task_id == task_id:
            s.sort_order = item.sort_order
    await db.flush()
    return await get_subtasks(db, task_id)
