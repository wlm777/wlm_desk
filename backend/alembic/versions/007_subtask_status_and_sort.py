"""add subtask status enum and sort_order

Revision ID: 007
Revises: 006
Create Date: 2026-04-01
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "007"
down_revision: Union[str, None] = "006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create subtask_status enum
    subtask_status = sa.Enum("no_progress", "in_progress", "completed", name="subtask_status")
    subtask_status.create(op.get_bind(), checkfirst=True)

    # Add columns
    op.add_column("task_subtasks", sa.Column("status", subtask_status, nullable=True))
    op.add_column("task_subtasks", sa.Column("sort_order", sa.Integer(), nullable=True))

    # Migrate existing data: is_completed=true -> completed, else no_progress
    conn = op.get_bind()
    conn.execute(sa.text(
        "UPDATE task_subtasks SET status = 'completed' WHERE is_completed = true"
    ))
    conn.execute(sa.text(
        "UPDATE task_subtasks SET status = 'no_progress' WHERE is_completed = false OR status IS NULL"
    ))

    # Assign sort_order based on created_at ordering per task
    conn.execute(sa.text("""
        UPDATE task_subtasks SET sort_order = sub.rn * 1000
        FROM (
            SELECT id, ROW_NUMBER() OVER (PARTITION BY task_id ORDER BY created_at) as rn
            FROM task_subtasks
        ) sub
        WHERE task_subtasks.id = sub.id
    """))

    # Make columns non-nullable
    op.alter_column("task_subtasks", "status", nullable=False, server_default="no_progress")
    op.alter_column("task_subtasks", "sort_order", nullable=False, server_default="0")


def downgrade() -> None:
    op.drop_column("task_subtasks", "sort_order")
    op.drop_column("task_subtasks", "status")
    sa.Enum(name="subtask_status").drop(op.get_bind(), checkfirst=True)
