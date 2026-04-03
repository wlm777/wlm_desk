from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class TaskWatcherAdd(BaseModel):
    user_id: uuid.UUID


class TaskWatcherRead(BaseModel):
    id: uuid.UUID
    task_id: uuid.UUID
    user_id: uuid.UUID
    added_at: datetime

    model_config = {"from_attributes": True}
