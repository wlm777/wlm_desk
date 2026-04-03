"""add user slack webhook and notification preference fields

Revision ID: 010
Revises: 009
Create Date: 2026-04-02
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "010"
down_revision: Union[str, None] = "009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("slack_webhook_url", sa.String(512), nullable=True))
    op.add_column("users", sa.Column("slack_enabled", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("users", sa.Column("slack_channel_label", sa.String(128), nullable=True))
    op.add_column("users", sa.Column("notify_daily_new_tasks", sa.Boolean(), nullable=False, server_default="true"))
    op.add_column("users", sa.Column("notify_daily_in_progress", sa.Boolean(), nullable=False, server_default="true"))
    op.add_column("users", sa.Column("notify_comment", sa.Boolean(), nullable=False, server_default="true"))
    op.add_column("users", sa.Column("notify_task_created", sa.Boolean(), nullable=False, server_default="true"))
    op.add_column("users", sa.Column("notify_task_updated", sa.Boolean(), nullable=False, server_default="true"))
    op.add_column("users", sa.Column("notify_watcher", sa.Boolean(), nullable=False, server_default="true"))
    op.add_column("users", sa.Column("notify_file_upload", sa.Boolean(), nullable=False, server_default="true"))


def downgrade() -> None:
    op.drop_column("users", "notify_file_upload")
    op.drop_column("users", "notify_watcher")
    op.drop_column("users", "notify_task_updated")
    op.drop_column("users", "notify_task_created")
    op.drop_column("users", "notify_comment")
    op.drop_column("users", "notify_daily_in_progress")
    op.drop_column("users", "notify_daily_new_tasks")
    op.drop_column("users", "slack_channel_label")
    op.drop_column("users", "slack_enabled")
    op.drop_column("users", "slack_webhook_url")
