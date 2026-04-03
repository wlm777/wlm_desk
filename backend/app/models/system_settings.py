"""Single-row system settings table."""

from sqlalchemy import Boolean, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, UUIDMixin, TimestampMixin


class SystemSettings(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "system_settings"

    max_upload_size_mb: Mapped[int] = mapped_column(Integer, nullable=False, default=10)
    allowed_file_types: Mapped[str] = mapped_column(Text, nullable=False, default="")
    image_preview_max_width: Mapped[int] = mapped_column(Integer, nullable=False, default=640)
    image_thumbnail_size: Mapped[int] = mapped_column(Integer, nullable=False, default=120)
    slack_digest_hour: Mapped[int] = mapped_column(Integer, nullable=False, default=8)
