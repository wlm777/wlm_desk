"""add color fields to users and task_lists

Revision ID: 006
Revises: 005
Create Date: 2026-04-01
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "006"
down_revision: Union[str, None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

PALETTE = [
    "#B4C7E7", "#C5B4E3", "#E7B4C7", "#B4E7D5", "#E7D5B4",
    "#B4D9E7", "#D5B4E7", "#E7C7B4", "#B4E7B8", "#E7E7B4",
    "#C7B4E7", "#B4E7E0", "#E7B4D5", "#D9E7B4", "#E7D0B4",
    "#B4C0E7", "#E0B4E7", "#B4E7CB", "#E7C0B4", "#C0E7B4",
]


def upgrade() -> None:
    op.add_column("users", sa.Column("color", sa.String(7), nullable=True))
    op.add_column("task_lists", sa.Column("color", sa.String(7), nullable=True))

    # Backfill existing rows with random colors
    conn = op.get_bind()
    users = conn.execute(sa.text("SELECT id FROM users")).fetchall()
    for i, row in enumerate(users):
        color = PALETTE[i % len(PALETTE)]
        conn.execute(sa.text("UPDATE users SET color = :c WHERE id = :id"), {"c": color, "id": row[0]})

    lists = conn.execute(sa.text("SELECT id FROM task_lists")).fetchall()
    for i, row in enumerate(lists):
        color = PALETTE[(i + 5) % len(PALETTE)]
        conn.execute(sa.text("UPDATE task_lists SET color = :c WHERE id = :id"), {"c": color, "id": row[0]})


def downgrade() -> None:
    op.drop_column("task_lists", "color")
    op.drop_column("users", "color")
