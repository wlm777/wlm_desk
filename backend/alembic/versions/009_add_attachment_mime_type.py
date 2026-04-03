"""add mime_type to attachments

Revision ID: 009
Revises: 008
Create Date: 2026-04-01
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "009"
down_revision: Union[str, None] = "008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("attachments", sa.Column("mime_type", sa.String(128), nullable=True))

    # Backfill mime_type from file extension
    conn = op.get_bind()
    ext_map = {
        ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
        ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml",
        ".pdf": "application/pdf", ".txt": "text/plain", ".csv": "text/csv",
    }
    for ext, mime in ext_map.items():
        conn.execute(sa.text(
            f"UPDATE attachments SET mime_type = :mime WHERE LOWER(file_name) LIKE :pattern AND mime_type IS NULL"
        ), {"mime": mime, "pattern": f"%{ext}"})


def downgrade() -> None:
    op.drop_column("attachments", "mime_type")
