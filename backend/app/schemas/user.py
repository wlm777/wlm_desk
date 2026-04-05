from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel

from app.models.enums import UserRole


class UserCreate(BaseModel):
    full_name: str
    email: str
    password: str
    role: UserRole = UserRole.user
    timezone: str = "UTC"


class UserRead(BaseModel):
    id: uuid.UUID
    full_name: str
    email: str
    role: UserRole
    timezone: str
    is_active: bool
    color: str | None = None
    slack_user_id: str | None = None
    working_days: str = "1,2,3,4,5"
    slack_webhook_url: str | None = None
    slack_enabled: bool = False

    notify_daily_new_tasks: bool = True
    notify_daily_in_progress: bool = True
    notify_comment: bool = True
    notify_task_created: bool = True
    notify_task_updated: bool = True
    notify_watcher: bool = True
    notify_task_assigned: bool = True
    notify_subtask: bool = True
    notify_file_upload: bool = True
    last_login_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    full_name: str | None = None
    email: str | None = None
    password: str | None = None
    role: UserRole | None = None
    timezone: str | None = None
    working_days: str | None = None
    slack_webhook_url: str | None = None
    slack_enabled: bool | None = None

    notify_daily_new_tasks: bool | None = None
    notify_daily_in_progress: bool | None = None
    notify_comment: bool | None = None
    notify_task_created: bool | None = None
    notify_task_updated: bool | None = None
    notify_watcher: bool | None = None
    notify_task_assigned: bool | None = None
    notify_subtask: bool | None = None
    notify_file_upload: bool | None = None


class ProfileUpdate(BaseModel):
    full_name: str | None = None
    email: str | None = None
    timezone: str | None = None
    password: str | None = None
    color: str | None = None
    working_days: str | None = None
    slack_webhook_url: str | None = None
    slack_enabled: bool | None = None

    notify_daily_new_tasks: bool | None = None
    notify_daily_in_progress: bool | None = None
    notify_comment: bool | None = None
    notify_task_created: bool | None = None
    notify_task_updated: bool | None = None
    notify_watcher: bool | None = None
    notify_task_assigned: bool | None = None
    notify_subtask: bool | None = None
    notify_file_upload: bool | None = None
