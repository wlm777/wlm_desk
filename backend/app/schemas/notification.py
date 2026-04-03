from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class NotificationRead(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    type: str
    payload: dict | None
    is_read: bool
    created_at: datetime

    model_config = {"from_attributes": True}
