from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel

from app.models.enums import SubtaskStatus


class SubtaskCreate(BaseModel):
    title: str


class SubtaskRead(BaseModel):
    id: uuid.UUID
    task_id: uuid.UUID
    title: str
    status: SubtaskStatus
    sort_order: int
    is_completed: bool
    is_archived: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SubtaskUpdate(BaseModel):
    title: str | None = None
    status: SubtaskStatus | None = None


class SubtaskReorderItem(BaseModel):
    id: uuid.UUID
    sort_order: int


class SubtaskReorder(BaseModel):
    items: list[SubtaskReorderItem]
