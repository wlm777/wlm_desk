from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class AuditLogRead(BaseModel):
    id: uuid.UUID
    entity_type: str
    entity_id: uuid.UUID
    action: str
    actor_user_id: uuid.UUID
    payload_json: dict | None
    created_at: datetime

    model_config = {"from_attributes": True}
