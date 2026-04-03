from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class TaskListCreate(BaseModel):
    name: str
    position: int | None = None


class TaskListRead(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    position: int
    color: str | None = None
    is_archived: bool
    created_at: datetime
    updated_at: datetime
    task_count: int = 0

    model_config = {"from_attributes": True}


class TaskListUpdate(BaseModel):
    name: str | None = None


class TaskListReorderItem(BaseModel):
    id: uuid.UUID
    position: int


class TaskListReorder(BaseModel):
    items: list[TaskListReorderItem]
