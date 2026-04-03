from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class TaskAssigneeAdd(BaseModel):
    user_id: uuid.UUID


class TaskAssigneeRead(BaseModel):
    id: uuid.UUID
    task_id: uuid.UUID
    user_id: uuid.UUID
    assigned_at: datetime

    model_config = {"from_attributes": True}
