"""v5: add orchestration columns to tasks

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-04-30
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'd4e5f6a7b8c9'
down_revision: Union[str, Sequence[str], None] = 'c3d4e5f6a7b8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('tasks', sa.Column('orchestrator_id', sa.String(100), nullable=True))
    op.add_column('tasks', sa.Column('human_review_required', sa.Boolean(),
                                     server_default=sa.text('0'), nullable=False))
    op.add_column('tasks', sa.Column('orchestration_review_pending', sa.Boolean(),
                                     server_default=sa.text('0'), nullable=False))


def downgrade() -> None:
    op.drop_column('tasks', 'orchestration_review_pending')
    op.drop_column('tasks', 'human_review_required')
    op.drop_column('tasks', 'orchestrator_id')
