"""Due date reminder logic. Scans tasks and creates notifications.

Dedup: One reminder per task per user per day, keyed as {task_id}:due:{YYYY-MM-DD}.
      Dedup is absolute — ignores is_read state.
Recipients: All assignees, or creator if no assignees.
Exclusions: Archived tasks, archived projects, completed tasks.
Due date: date-only field (YYYY-MM-DD), not datetime.
"""

import logging
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Project, Task, TaskAssignee
from app.models.enums import TaskStatus
from app.services import notification as notif_service

logger = logging.getLogger(__name__)


async def scan_and_notify(db: AsyncSession) -> int:
    """Scan for overdue and due-today tasks, send notifications.

    Returns the number of tasks scanned.
    """
    today = date.today()
    today_str = today.isoformat()

    result = await db.execute(
        select(Task)
        .join(Project, Project.id == Task.project_id)
        .where(
            Task.is_archived.is_(False),
            Project.is_archived.is_(False),
            Task.status != TaskStatus.completed,
            Task.due_date.isnot(None),
            Task.due_date <= today,
        )
    )
    tasks = result.scalars().all()
    logger.debug("Found %d tasks with due dates <= today", len(tasks))

    for task in tasks:
        due_state = "due_today" if task.due_date == today else "overdue"
        dedup_key = f"{task.id}:due:{today_str}"

        payload = {
            "task_id": str(task.id),
            "project_id": str(task.project_id),
            "task_title": task.title,
            "due_date": str(task.due_date),  # YYYY-MM-DD (date-only)
            "due_state": due_state,
        }

        assignee_result = await db.execute(
            select(TaskAssignee.user_id).where(TaskAssignee.task_id == task.id)
        )
        assignee_ids = list(assignee_result.scalars().all())
        recipients = assignee_ids if assignee_ids else [task.created_by_id]

        for user_id in recipients:
            await notif_service.create_notification(
                db, user_id, "due_reminder", payload, dedup_key=dedup_key,
            )

    return len(tasks)
