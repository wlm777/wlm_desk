"""drop slack_channel_label from users

Revision ID: 013
Revises: 012
Create Date: 2026-04-02
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "013"
down_revision: Union[str, None] = "012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("users", "slack_channel_label")


def downgrade() -> None:
    op.add_column("users", sa.Column("slack_channel_label", sa.String(128), nullable=True))
