from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class ProjectMemberAdd(BaseModel):
    user_id: uuid.UUID


class ProjectMemberRead(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    user_id: uuid.UUID
    added_at: datetime

    model_config = {"from_attributes": True}


class ProjectMemberWithUser(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    user_id: uuid.UUID
    added_at: datetime
    full_name: str
    email: str
    color: str | None = None

    model_config = {"from_attributes": True}
