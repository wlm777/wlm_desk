from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel

from app.models.enums import TaskPriority, TaskStatus


class TaskCreate(BaseModel):
    list_id: uuid.UUID
    title: str
    description_plain: str | None = None
    description_rich: dict | None = None
    status: TaskStatus = TaskStatus.no_progress
    priority: TaskPriority = TaskPriority.none
    start_date: date | None = None
    due_date: date | None = None
    assignee_ids: list[uuid.UUID] | None = None


class TaskRead(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    list_id: uuid.UUID
    title: str
    description_plain: str | None
    description_rich: dict | None = None
    status: TaskStatus
    priority: TaskPriority
    start_date: date | None
    due_date: date | None
    sort_order: int
    created_by_id: uuid.UUID
    is_completed: bool
    is_archived: bool
    last_activity_at: datetime
    updated_by_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime
    subtask_count: int = 0
    comment_count: int = 0
    assignee_ids: list[str] = []
    subtasks: list[dict] | None = None

    model_config = {"from_attributes": True}


class GlobalTaskRead(TaskRead):
    """TaskRead enriched with project and list names for cross-project views."""
    project_name: str = ""
    list_name: str = ""


class TaskUpdate(BaseModel):
    list_id: uuid.UUID | None = None
    title: str | None = None
    description_plain: str | None = None
    description_rich: dict | None = None
    status: TaskStatus | None = None
    priority: TaskPriority | None = None
    start_date: date | None = None
    due_date: date | None = None
    sort_order: int | None = None


class TaskReorderItem(BaseModel):
    id: uuid.UUID
    sort_order: int


class TaskReorder(BaseModel):
    list_id: uuid.UUID
    items: list[TaskReorderItem]


class TaskReorderResponseItem(BaseModel):
    id: uuid.UUID
    sort_order: int


class TaskReorderResponse(BaseModel):
    items: list[TaskReorderResponseItem]


class BatchChanges(BaseModel):
    status: TaskStatus | None = None
    priority: TaskPriority | None = None
    assignee_ids: list[uuid.UUID] | None = None
    list_id: uuid.UUID | None = None


class BatchUpdateRequest(BaseModel):
    task_ids: list[uuid.UUID]
    changes: BatchChanges


class BatchError(BaseModel):
    task_id: uuid.UUID
    reason: str


class BatchUpdateResponse(BaseModel):
    updated: int
    skipped: int
    errors: list[BatchError]
