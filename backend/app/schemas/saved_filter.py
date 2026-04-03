from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, model_validator

# Only these keys are allowed in filters_json
ALLOWED_FILTER_KEYS = {"status", "priority", "assignee_id", "list_id", "due_mode"}

# Allowed values for due_mode
ALLOWED_DUE_MODES = {"overdue", "due_today", "due_this_week", "no_due_date"}


class FilterPayload(BaseModel):
    status: str | None = None
    priority: str | None = None
    assignee_id: str | None = None
    list_id: str | None = None
    due_mode: str | None = None

    @model_validator(mode="after")
    def validate_keys(self):
        if self.due_mode and self.due_mode not in ALLOWED_DUE_MODES:
            raise ValueError(f"Invalid due_mode: {self.due_mode}")
        return self


class SavedFilterCreate(BaseModel):
    name: str
    filters_json: FilterPayload


class SavedFilterUpdate(BaseModel):
    name: str | None = None
    filters_json: FilterPayload | None = None


class SavedFilterRead(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    name: str
    filters_json: dict
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
