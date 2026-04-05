from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel


class DashboardSummary(BaseModel):
    my_tasks_count: int
    in_progress_count: int
    due_today_count: int
    overdue_count: int
    projects_count: int


class WorkloadItem(BaseModel):
    user_id: uuid.UUID
    full_name: str
    email: str
    color: str | None = None
    active_task_count: int


class StuckTask(BaseModel):
    id: uuid.UUID
    title: str
    project_id: uuid.UUID
    project_name: str
    priority: str
    due_date: date | None
    last_activity_at: datetime
    assignee_names: list[str]


class HighPriorityTask(BaseModel):
    id: uuid.UUID
    title: str
    project_id: uuid.UUID
    project_name: str
    status: str
    due_date: date | None
    assignee_names: list[str]


class ProjectProgress(BaseModel):
    project_id: uuid.UUID
    total: int
    completed: int
