from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class ActivityEvent(BaseModel):
    id: uuid.UUID
    entity_type: str
    action: str
    actor_name: str
    description: str
    payload: dict | None
    created_at: datetime
