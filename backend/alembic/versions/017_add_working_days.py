"""add working_days to users

Revision ID: 017
Revises: 016
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "017"
down_revision: Union[str, None] = "016"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Default: Mon-Fri
DEFAULT_WORKING_DAYS = "1,2,3,4,5"


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("working_days", sa.String(20), nullable=False, server_default=DEFAULT_WORKING_DAYS),
    )


def downgrade() -> None:
    op.drop_column("users", "working_days")
