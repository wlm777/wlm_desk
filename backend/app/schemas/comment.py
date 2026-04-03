from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class CommentCreate(BaseModel):
    content: str
    content_rich: dict | None = None
    parent_id: uuid.UUID | None = None


class CommentUpdate(BaseModel):
    content: str
    content_rich: dict | None = None


class CommentRead(BaseModel):
    id: uuid.UUID
    task_id: uuid.UUID
    parent_id: uuid.UUID | None
    author_id: uuid.UUID
    content: str
    content_rich: dict | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
