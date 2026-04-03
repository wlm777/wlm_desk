from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel

IMAGE_MIME_PREFIXES = ("image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml")
INLINE_MIME_TYPES = {
    *IMAGE_MIME_PREFIXES,
    "application/pdf",
    "text/plain",
    "text/csv",
}


class AttachmentRead(BaseModel):
    id: uuid.UUID
    task_id: uuid.UUID
    file_name: str
    file_size: int
    uploaded_by: uuid.UUID
    mime_type: str | None = None
    is_image: bool = False
    preview_url: str | None = None
    thumb_url: str | None = None
    view_url: str | None = None
    download_url: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
