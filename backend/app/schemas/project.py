from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class ProjectCreate(BaseModel):
    name: str
    description: str | None = None
    description_rich: dict | None = None
    member_ids: list[uuid.UUID] | None = None


class ProjectRead(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    description_rich: dict | None = None
    owner_id: uuid.UUID
    is_archived: bool
    created_at: datetime
    updated_at: datetime
    task_count: int | None = None
    member_count: int | None = None

    model_config = {"from_attributes": True}


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    description_rich: dict | None = None
