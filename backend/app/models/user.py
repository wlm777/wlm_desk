import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDMixin
from app.models.enums import UserRole


class User(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "users"

    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, name="user_role"), nullable=False, default=UserRole.user
    )
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, default="UTC")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    color: Mapped[str | None] = mapped_column(String(7), nullable=True)
    slack_user_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    last_digest_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Slack webhook notifications
    slack_webhook_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    slack_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")

    # Notification preferences
    notify_daily_new_tasks: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    notify_daily_in_progress: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    notify_comment: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    notify_task_created: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    notify_task_updated: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    notify_watcher: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    notify_task_assigned: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    notify_subtask: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    notify_file_upload: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
