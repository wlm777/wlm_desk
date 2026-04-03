"""add system_settings table with default row

Revision ID: 012
Revises: 011
Create Date: 2026-04-02
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
import uuid

revision: str = "012"
down_revision: Union[str, None] = "011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

DEFAULT_TYPES = (
    "image/jpeg,image/png,image/gif,image/webp,image/svg+xml,"
    "application/pdf,application/msword,"
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document,"
    "application/vnd.ms-excel,"
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,"
    "application/vnd.ms-powerpoint,"
    "application/vnd.openxmlformats-officedocument.presentationml.presentation,"
    "text/plain,text/csv,application/zip"
)


def upgrade() -> None:
    op.create_table(
        "system_settings",
        sa.Column("id", sa.Uuid(), primary_key=True, default=uuid.uuid4),
        sa.Column("max_upload_size_mb", sa.Integer(), nullable=False, server_default="10"),
        sa.Column("allowed_file_types", sa.Text(), nullable=False, server_default=sa.text(f"'{DEFAULT_TYPES}'")),
        sa.Column("image_preview_max_width", sa.Integer(), nullable=False, server_default="640"),
        sa.Column("image_thumbnail_size", sa.Integer(), nullable=False, server_default="120"),
        sa.Column("slack_digest_hour", sa.Integer(), nullable=False, server_default="8"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    # Insert default row
    op.execute(
        f"INSERT INTO system_settings (id, max_upload_size_mb, allowed_file_types, image_preview_max_width, image_thumbnail_size, slack_digest_hour) "
        f"VALUES ('{uuid.uuid4()}', 10, '{DEFAULT_TYPES}', 640, 120, 8)"
    )


def downgrade() -> None:
    op.drop_table("system_settings")
