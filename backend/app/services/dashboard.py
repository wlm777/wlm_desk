from datetime import date, datetime, timedelta, timezone

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Project, ProjectMember, Task, TaskAssignee, UserRole
from app.models.enums import TaskPriority, TaskStatus
from app.models.user import User
from app.schemas.dashboard import DashboardSummary, HighPriorityTask, ProjectProgress, StuckTask, WorkloadItem


async def get_summary(db: AsyncSession, user: User) -> DashboardSummary:
    today = date.today()

    # Base filter: non-archived tasks in non-archived projects, assigned to THIS user
    my_tasks = select(TaskAssignee.task_id).where(TaskAssignee.user_id == user.id)
    base = and_(
        Task.is_archived.is_(False),
        Task.project_id.in_(select(Project.id).where(Project.is_archived.is_(False))),
        Task.id.in_(my_tasks),
    )

    # my_tasks_count: all my tasks
    my_tasks_count = (
        await db.execute(select(func.count()).select_from(Task).where(base))
    ).scalar() or 0

    # in_progress_count: my tasks in progress
    in_progress_count = (
        await db.execute(
            select(func.count()).select_from(Task)
            .where(base, Task.status == TaskStatus.in_progress)
        )
    ).scalar() or 0

    # due_today_count: my tasks, not completed, due today
    not_completed = and_(base, Task.status != TaskStatus.completed)
    due_today_count = (
        await db.execute(
            select(func.count()).select_from(Task)
            .where(not_completed, Task.due_date == today)
        )
    ).scalar() or 0

    # overdue_count: my tasks, not completed, overdue
    overdue_count = (
        await db.execute(
            select(func.count()).select_from(Task)
            .where(not_completed, Task.due_date < today, Task.due_date.isnot(None))
        )
    ).scalar() or 0

    # projects_count: non-archived projects
    if user.role == UserRole.admin:
        projects_count = (
            await db.execute(
                select(func.count())
                .select_from(Project)
                .where(Project.is_archived.is_(False))
            )
        ).scalar() or 0
    else:
        projects_count = (
            await db.execute(
                select(func.count())
                .select_from(ProjectMember)
                .join(Project, Project.id == ProjectMember.project_id)
                .where(ProjectMember.user_id == user.id, Project.is_archived.is_(False))
            )
        ).scalar() or 0

    return DashboardSummary(
        my_tasks_count=my_tasks_count,
        in_progress_count=in_progress_count,
        due_today_count=due_today_count,
        overdue_count=overdue_count,
        projects_count=projects_count,
    )


async def get_workload(db: AsyncSession, user: User) -> list[WorkloadItem]:
    """Get active task count per team member.

    Admin sees all users. Manager/user sees members of their projects.
    Only counts non-archived, non-completed tasks in non-archived projects.
    """
    active_filter = and_(
        Task.is_archived.is_(False),
        Task.status != TaskStatus.completed,
        Task.project_id.in_(select(Project.id).where(Project.is_archived.is_(False))),
    )

    # Subquery: count active tasks per user via assignees
    task_counts = (
        select(
            TaskAssignee.user_id,
            func.count(TaskAssignee.task_id).label("cnt"),
        )
        .join(Task, Task.id == TaskAssignee.task_id)
        .where(active_filter)
        .group_by(TaskAssignee.user_id)
        .subquery()
    )

    # Get users visible to the caller
    if user.role == UserRole.admin:
        user_filter = User.is_active.is_(True)
    else:
        visible_projects = (
            select(ProjectMember.project_id).where(ProjectMember.user_id == user.id)
        )
        visible_users = (
            select(ProjectMember.user_id)
            .where(ProjectMember.project_id.in_(visible_projects))
        )
        user_filter = and_(User.is_active.is_(True), User.id.in_(visible_users))

    result = await db.execute(
        select(
            User.id, User.full_name, User.email, User.color,
            func.coalesce(task_counts.c.cnt, 0).label("active_task_count"),
        )
        .outerjoin(task_counts, task_counts.c.user_id == User.id)
        .where(user_filter)
        .order_by(func.coalesce(task_counts.c.cnt, 0).desc())
    )

    return [
        WorkloadItem(
            user_id=row.id, full_name=row.full_name,
            email=row.email, color=row.color,
            active_task_count=row.active_task_count,
        )
        for row in result.all()
    ]


async def get_stuck_tasks(
    db: AsyncSession, user: User, *, days: int = 5, limit: int = 20
) -> list[StuckTask]:
    """Get tasks with no activity for N days (default 5).

    Stuck = non-archived, non-completed, last_activity_at older than N days ago.
    Scoped to user's projects (admin sees all).
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    q = (
        select(Task, Project.name.label("project_name"))
        .join(Project, Project.id == Task.project_id)
        .where(
            Task.is_archived.is_(False),
            Project.is_archived.is_(False),
            Task.status != TaskStatus.completed,
            Task.last_activity_at < cutoff,
        )
    )

    if user.role != UserRole.admin:
        user_projects = select(ProjectMember.project_id).where(ProjectMember.user_id == user.id)
        q = q.where(Task.project_id.in_(user_projects))

    q = q.order_by(Task.last_activity_at.asc()).limit(min(limit, 50))
    result = await db.execute(q)
    rows = result.all()

    stuck = []
    for task, project_name in rows:
        # Get assignee names
        assignee_result = await db.execute(
            select(User.full_name)
            .join(TaskAssignee, TaskAssignee.user_id == User.id)
            .where(TaskAssignee.task_id == task.id)
        )
        assignee_names = list(assignee_result.scalars().all())

        stuck.append(StuckTask(
            id=task.id,
            title=task.title,
            project_id=task.project_id,
            project_name=project_name,
            priority=task.priority.value,
            due_date=task.due_date,
            last_activity_at=task.last_activity_at,
            assignee_names=assignee_names,
        ))

    return stuck


async def get_high_priority_tasks(
    db: AsyncSession, user: User, *, limit: int = 20
) -> list[HighPriorityTask]:
    """Get all active high-priority tasks visible to user."""
    q = (
        select(Task, Project.name.label("project_name"))
        .join(Project, Project.id == Task.project_id)
        .where(
            Task.is_archived.is_(False),
            Project.is_archived.is_(False),
            Task.status != TaskStatus.completed,
            Task.priority == TaskPriority.high,
        )
    )

    if user.role != UserRole.admin:
        user_projects = select(ProjectMember.project_id).where(ProjectMember.user_id == user.id)
        q = q.where(Task.project_id.in_(user_projects))

    q = q.order_by(Task.due_date.asc().nulls_last(), Task.created_at.desc()).limit(min(limit, 50))
    result = await db.execute(q)
    rows = result.all()

    items = []
    for task, project_name in rows:
        assignee_result = await db.execute(
            select(User.full_name)
            .join(TaskAssignee, TaskAssignee.user_id == User.id)
            .where(TaskAssignee.task_id == task.id)
        )
        assignee_names = list(assignee_result.scalars().all())
        items.append(HighPriorityTask(
            id=task.id,
            title=task.title,
            project_id=task.project_id,
            project_name=project_name,
            status=task.status.value,
            due_date=task.due_date,
            assignee_names=assignee_names,
        ))
    return items


async def get_project_progress(db: AsyncSession, user: User) -> list[ProjectProgress]:
    """Get completed/total parent task counts per project (non-archived tasks only)."""
    base = and_(
        Task.is_archived.is_(False),
        Project.is_archived.is_(False),
    )

    q = (
        select(
            Project.id.label("project_id"),
            func.count(Task.id).label("total"),
            func.count(Task.id).filter(Task.status == TaskStatus.completed).label("completed"),
        )
        .join(Task, Task.project_id == Project.id)
        .where(base)
        .group_by(Project.id)
    )

    if user.role != UserRole.admin:
        user_projects = select(ProjectMember.project_id).where(ProjectMember.user_id == user.id)
        q = q.where(Project.id.in_(user_projects))

    result = await db.execute(q)
    return [
        ProjectProgress(project_id=row.project_id, total=row.total, completed=row.completed)
        for row in result.all()
    ]
