import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.colors import color_from_id
from app.models.task_list import TaskList
from app.schemas.task_list import TaskListCreate, TaskListReorder, TaskListUpdate


async def create_list(
    db: AsyncSession, project_id: uuid.UUID, data: TaskListCreate
) -> TaskList:
    if data.position is not None:
        position = data.position
    else:
        result = await db.execute(
            select(func.coalesce(func.max(TaskList.position), -1))
            .where(TaskList.project_id == project_id, TaskList.is_archived.is_(False))
        )
        position = (result.scalar() or -1) + 1

    task_list = TaskList(project_id=project_id, name=data.name, position=position)
    db.add(task_list)
    await db.flush()
    task_list.color = color_from_id(str(task_list.id))
    return task_list


async def get_lists(
    db: AsyncSession, project_id: uuid.UUID, *, include_archived: bool = False
) -> list[TaskList]:
    q = select(TaskList).where(TaskList.project_id == project_id)
    if not include_archived:
        q = q.where(TaskList.is_archived.is_(False))
    result = await db.execute(q.order_by(TaskList.position))
    return list(result.scalars().all())


async def get_list_by_id(db: AsyncSession, list_id: uuid.UUID) -> TaskList | None:
    return await db.get(TaskList, list_id)


async def update_list(db: AsyncSession, task_list: TaskList, data: TaskListUpdate) -> TaskList:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(task_list, field, value)
    await db.flush()
    return task_list


async def archive_list(db: AsyncSession, task_list: TaskList) -> TaskList:
    task_list.is_archived = True
    await db.flush()
    return task_list


async def delete_list(
    db: AsyncSession,
    task_list: TaskList,
    destination_list_id: uuid.UUID | None = None,
) -> None:
    """Delete a list. If it has tasks, move them to destination_list first."""
    from app.models import Task

    # Count tasks in this list
    task_count_result = await db.execute(
        select(func.count()).select_from(Task)
        .where(Task.list_id == task_list.id, Task.is_archived.is_(False))
    )
    task_count = task_count_result.scalar() or 0

    if task_count > 0:
        if not destination_list_id:
            raise ValueError("List has tasks — destination_list_id required")

        dest = await get_list_by_id(db, destination_list_id)
        if not dest or dest.project_id != task_list.project_id:
            raise ValueError("Invalid destination list")
        if dest.id == task_list.id:
            raise ValueError("Cannot move tasks to the same list")
        if dest.is_archived:
            raise ValueError("Cannot move tasks to an archived list")

        # Get max sort_order in destination
        max_order_result = await db.execute(
            select(func.coalesce(func.max(Task.sort_order), 0))
            .where(Task.list_id == dest.id, Task.is_archived.is_(False))
        )
        base_order = (max_order_result.scalar() or 0) + 1000

        # Move all tasks
        tasks_result = await db.execute(
            select(Task).where(Task.list_id == task_list.id)
        )
        for i, task in enumerate(tasks_result.scalars().all()):
            task.list_id = dest.id
            task.sort_order = base_order + (i * 1000)

        await db.flush()

    # Delete the list
    await db.delete(task_list)
    await db.flush()


async def reorder_lists(
    db: AsyncSession, project_id: uuid.UUID, data: TaskListReorder
) -> list[TaskList]:
    for item in data.items:
        tl = await db.get(TaskList, item.id)
        if tl and tl.project_id == project_id:
            tl.position = item.position
    await db.flush()
    return await get_lists(db, project_id)
