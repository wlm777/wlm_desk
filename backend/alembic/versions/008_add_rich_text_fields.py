"""add rich text JSONB fields

Revision ID: 008
Revises: 007
Create Date: 2026-04-01
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "008"
down_revision: Union[str, None] = "007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("tasks", sa.Column("description_rich", JSONB, nullable=True))
    op.add_column("comments", sa.Column("content_rich", JSONB, nullable=True))
    op.add_column("projects", sa.Column("description_rich", JSONB, nullable=True))

    # Backfill: convert existing plain text to TipTap paragraph JSON
    conn = op.get_bind()

    # Tasks with description
    conn.execute(sa.text("""
        UPDATE tasks SET description_rich = jsonb_build_object(
            'type', 'doc',
            'content', jsonb_build_array(
                jsonb_build_object('type', 'paragraph', 'content',
                    jsonb_build_array(jsonb_build_object('type', 'text', 'text', description_plain))
                )
            )
        ) WHERE description_plain IS NOT NULL AND description_plain != ''
    """))

    # Comments
    conn.execute(sa.text("""
        UPDATE comments SET content_rich = jsonb_build_object(
            'type', 'doc',
            'content', jsonb_build_array(
                jsonb_build_object('type', 'paragraph', 'content',
                    jsonb_build_array(jsonb_build_object('type', 'text', 'text', content))
                )
            )
        ) WHERE content IS NOT NULL AND content != ''
    """))

    # Projects with description
    conn.execute(sa.text("""
        UPDATE projects SET description_rich = jsonb_build_object(
            'type', 'doc',
            'content', jsonb_build_array(
                jsonb_build_object('type', 'paragraph', 'content',
                    jsonb_build_array(jsonb_build_object('type', 'text', 'text', description))
                )
            )
        ) WHERE description IS NOT NULL AND description != ''
    """))


def downgrade() -> None:
    op.drop_column("projects", "description_rich")
    op.drop_column("comments", "content_rich")
    op.drop_column("tasks", "description_rich")
