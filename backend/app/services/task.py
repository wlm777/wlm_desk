import uuid
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, not_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Task, TaskAssignee, TaskList
from app.models.comment import Comment
from app.models.enums import TaskPriority, TaskStatus
from app.models.task_subtask import TaskSubtask
from app.schemas.task import TaskCreate, TaskReorder, TaskUpdate

# Allowed due_mode values:
#   overdue       → due_date < today AND status != completed
#   due_today     → due_date = today
#   due_this_week → due_date between today and today+6 (rolling 7 days including today)
#   no_due_date   → due_date IS NULL
ALLOWED_DUE_MODES = {"overdue", "due_today", "due_this_week", "no_due_date"}


async def create_task(
    db: AsyncSession,
    project_id: uuid.UUID,
    data: TaskCreate,
    creator_id: uuid.UUID,
) -> Task:
    # Calculate sort_order: max in list + 1000
    result = await db.execute(
        select(func.coalesce(func.max(Task.sort_order), 0))
        .where(Task.list_id == data.list_id, Task.is_archived.is_(False))
    )
    sort_order = (result.scalar() or 0) + 1000

    task = Task(
        project_id=project_id,
        list_id=data.list_id,
        title=data.title,
        description_plain=data.description_plain,
        status=data.status,
        priority=data.priority,
        start_date=data.start_date,
        due_date=data.due_date,
        sort_order=sort_order,
        created_by_id=creator_id,
        is_completed=data.status == TaskStatus.completed,
    )
    db.add(task)
    await db.flush()

    # Add assignees if provided
    if data.assignee_ids:
        for uid in data.assignee_ids:
            db.add(TaskAssignee(task_id=task.id, user_id=uid))
        await db.flush()

    return task


async def get_tasks(
    db: AsyncSession,
    project_id: uuid.UUID,
    *,
    list_id: uuid.UUID | None = None,
    status: TaskStatus | None = None,
    priority: TaskPriority | None = None,
    assignee_id: uuid.UUID | None = None,
    unassigned: bool = False,
    due_mode: str | None = None,
    viewer_id: uuid.UUID | None = None,
    viewer_role: str | None = None,
    search: str | None = None,
    limit: int = 50,
    offset: int = 0,
    include_archived: bool = False,
    newest_first: bool = False,
) -> tuple[list[Task], int]:
    """Query tasks with combinable filters.

    All filters are AND-combined. Assignee filters are mutually exclusive:
    if unassigned=True, assignee_id is ignored.

    due_mode uses rolling 7-day window for 'due_this_week' (today through today+6).
    """
    limit = min(limit, 100)
    q = select(Task).where(Task.project_id == project_id)
    count_q = select(func.count()).select_from(Task).where(Task.project_id == project_id)

    if not include_archived:
        q = q.where(Task.is_archived.is_(False))
        count_q = count_q.where(Task.is_archived.is_(False))

    # User role: only see tasks where assigned or creator
    if viewer_id and viewer_role == "user":
        user_visible = (
            Task.created_by_id == viewer_id
        ) | (
            Task.id.in_(select(TaskAssignee.task_id).where(TaskAssignee.user_id == viewer_id))
        )
        q = q.where(user_visible)
        count_q = count_q.where(user_visible)

    if list_id:
        q = q.where(Task.list_id == list_id)
        count_q = count_q.where(Task.list_id == list_id)
    if status:
        q = q.where(Task.status == status)
        count_q = count_q.where(Task.status == status)
    if priority:
        q = q.where(Task.priority == priority)
        count_q = count_q.where(Task.priority == priority)

    # Assignee filters (mutually exclusive: unassigned takes priority)
    if unassigned:
        no_assignee = not_(Task.id.in_(select(TaskAssignee.task_id)))
        q = q.where(no_assignee)
        count_q = count_q.where(no_assignee)
    elif assignee_id:
        q = q.join(TaskAssignee, TaskAssignee.task_id == Task.id).where(
            TaskAssignee.user_id == assignee_id
        )
        count_q = count_q.join(TaskAssignee, TaskAssignee.task_id == Task.id).where(
            TaskAssignee.user_id == assignee_id
        )

    # Due mode filters
    if due_mode and due_mode in ALLOWED_DUE_MODES:
        today = date.today()
        if due_mode == "overdue":
            cond = (Task.due_date < today) & Task.due_date.isnot(None) & (Task.status != TaskStatus.completed)
            q = q.where(cond)
            count_q = count_q.where(cond)
        elif due_mode == "due_today":
            q = q.where(Task.due_date == today)
            count_q = count_q.where(Task.due_date == today)
        elif due_mode == "due_this_week":
            week_end = today + timedelta(days=6)
            cond = (Task.due_date >= today) & (Task.due_date <= week_end) & Task.due_date.isnot(None)
            q = q.where(cond)
            count_q = count_q.where(cond)
        elif due_mode == "no_due_date":
            q = q.where(Task.due_date.is_(None))
            count_q = count_q.where(Task.due_date.is_(None))

    search = (search or "").strip()
    if search:
        term = f"%{search}%"
        search_cond = Task.title.ilike(term) | Task.description_plain.ilike(term)
        q = q.where(search_cond)
        count_q = count_q.where(search_cond)

    total = (await db.execute(count_q)).scalar() or 0

    # Sort by list position then sort_order
    q = q.join(TaskList, TaskList.id == Task.list_id)
    if newest_first:
        q = q.order_by(TaskList.position, Task.sort_order.desc())
    else:
        q = q.order_by(TaskList.position, Task.sort_order)
    q = q.offset(offset).limit(limit)
    result = await db.execute(q)
    return list(result.scalars().all()), total


async def get_tasks_global(
    db: AsyncSession,
    accessible_project_ids: set[uuid.UUID] | None,
    *,
    status: TaskStatus | None = None,
    priority: TaskPriority | None = None,
    assignee_id: uuid.UUID | None = None,
    unassigned: bool = False,
    due_mode: str | None = None,
    search: str | None = None,
    limit: int = 50,
    offset: int = 0,
    newest_first: bool = False,
    viewer_id: uuid.UUID | None = None,
    viewer_role: str | None = None,
) -> tuple[list[Task], int]:
    """Cross-project task query. accessible_project_ids=None means admin (all projects)."""
    from app.models import Project

    limit = min(limit, 100)
    q = select(Task).where(Task.is_archived.is_(False))
    count_q = select(func.count()).select_from(Task).where(Task.is_archived.is_(False))

    if accessible_project_ids is not None:
        if not accessible_project_ids:
            return [], 0
        q = q.where(Task.project_id.in_(accessible_project_ids))
        count_q = count_q.where(Task.project_id.in_(accessible_project_ids))

    # User role: only see tasks where assigned or creator
    if viewer_id and viewer_role == "user":
        user_visible = (
            Task.created_by_id == viewer_id
        ) | (
            Task.id.in_(select(TaskAssignee.task_id).where(TaskAssignee.user_id == viewer_id))
        )
        q = q.where(user_visible)
        count_q = count_q.where(user_visible)

    # Filter out archived projects
    q = q.join(Project, Project.id == Task.project_id).where(Project.is_archived.is_(False))
    count_q = count_q.join(Project, Project.id == Task.project_id).where(Project.is_archived.is_(False))

    if status:
        q = q.where(Task.status == status)
        count_q = count_q.where(Task.status == status)
    if priority:
        q = q.where(Task.priority == priority)
        count_q = count_q.where(Task.priority == priority)

    if unassigned:
        no_assignee = not_(Task.id.in_(select(TaskAssignee.task_id)))
        q = q.where(no_assignee)
        count_q = count_q.where(no_assignee)
    elif assignee_id:
        q = q.join(TaskAssignee, TaskAssignee.task_id == Task.id).where(TaskAssignee.user_id == assignee_id)
        count_q = count_q.join(TaskAssignee, TaskAssignee.task_id == Task.id).where(TaskAssignee.user_id == assignee_id)

    if due_mode and due_mode in ALLOWED_DUE_MODES:
        today = date.today()
        if due_mode == "overdue":
            cond = (Task.due_date < today) & Task.due_date.isnot(None) & (Task.status != TaskStatus.completed)
            q = q.where(cond)
            count_q = count_q.where(cond)
        elif due_mode == "due_today":
            q = q.where(Task.due_date == today)
            count_q = count_q.where(Task.due_date == today)
        elif due_mode == "due_this_week":
            week_end = today + timedelta(days=6)
            cond = (Task.due_date >= today) & (Task.due_date <= week_end) & Task.due_date.isnot(None)
            q = q.where(cond)
            count_q = count_q.where(cond)
        elif due_mode == "no_due_date":
            q = q.where(Task.due_date.is_(None))
            count_q = count_q.where(Task.due_date.is_(None))

    search = (search or "").strip()
    if search:
        term = f"%{search}%"
        search_cond = Task.title.ilike(term) | Task.description_plain.ilike(term)
        q = q.where(search_cond)
        count_q = count_q.where(search_cond)

    total = (await db.execute(count_q)).scalar() or 0

    q = q.join(TaskList, TaskList.id == Task.list_id)
    if newest_first:
        q = q.order_by(Project.name.desc(), TaskList.position.desc(), Task.sort_order.desc())
    else:
        q = q.order_by(Project.name, TaskList.position, Task.sort_order)
    q = q.offset(offset).limit(limit)
    result = await db.execute(q)
    return list(result.scalars().all()), total


async def get_task(db: AsyncSession, task_id: uuid.UUID) -> Task | None:
    return await db.get(Task, task_id)


async def get_task_with_counts(
    db: AsyncSession, task: Task, *, include_subtasks: bool = False
) -> dict:
    """Return task data with subtask_count, comment_count, and optionally subtasks list."""
    # Ensure all attributes are loaded (prevents MissingGreenlet on expired objects)
    await db.refresh(task)

    subtask_result = await db.execute(
        select(TaskSubtask)
        .where(TaskSubtask.task_id == task.id, TaskSubtask.is_archived.is_(False))
        .order_by(TaskSubtask.created_at)
    )
    subtask_rows = list(subtask_result.scalars().all())
    sub_count = len(subtask_rows)

    comment_count = (
        await db.execute(
            select(func.count()).select_from(Comment).where(Comment.task_id == task.id)
        )
    ).scalar() or 0

    # Get assignee IDs
    assignee_result = await db.execute(
        select(TaskAssignee.user_id).where(TaskAssignee.task_id == task.id)
    )
    assignee_ids = list(assignee_result.scalars().all())

    data = {
        **{c.key: getattr(task, c.key) for c in Task.__table__.columns},
        "subtask_count": sub_count,
        "comment_count": comment_count,
        "assignee_ids": [str(uid) for uid in assignee_ids],
    }

    if include_subtasks:
        data["subtasks"] = [
            {"id": s.id, "title": s.title, "status": s.status.value, "is_completed": s.is_completed, "sort_order": s.sort_order}
            for s in subtask_rows
        ]

    return data


async def update_task(
    db: AsyncSession, task: Task, data: TaskUpdate, actor_id: uuid.UUID
) -> Task:
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(task, field, value)

    # Sync is_completed with status
    if "status" in update_data:
        task.is_completed = task.status == TaskStatus.completed

    task.updated_by_id = actor_id
    task.last_activity_at = datetime.now(timezone.utc)
    await db.flush()
    return task


async def archive_task(db: AsyncSession, task: Task) -> Task:
    task.is_archived = True
    await db.flush()
    return task


async def reorder_tasks(
    db: AsyncSession, data: TaskReorder
) -> list[dict]:
    """Reorder tasks within a list. Returns normalized sort_order values."""
    results = []
    for item in data.items:
        task = await db.get(Task, item.id)
        if task and task.list_id == data.list_id:
            task.sort_order = item.sort_order
            results.append({"id": task.id, "sort_order": task.sort_order})
    await db.flush()
    return results


async def touch_task_activity(
    db: AsyncSession, task: Task, actor_id: uuid.UUID
) -> None:
    """Update last_activity_at and updated_by_id."""
    task.last_activity_at = datetime.now(timezone.utc)
    task.updated_by_id = actor_id
    await db.flush()
