"""v3: agent_runs and run_events tables

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-04-28
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'agent_runs',
        sa.Column('id', sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column('agent_id', sa.String(100), nullable=False),
        sa.Column('task_id', sa.Uuid(as_uuid=True),
                  sa.ForeignKey('tasks.id', ondelete='CASCADE'), nullable=False),
        sa.Column('started_at', sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
        sa.Column('finished_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('status', sa.String(50), nullable=False, server_default='running'),
    )
    op.create_table(
        'run_events',
        sa.Column('id', sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column('run_id', sa.Uuid(as_uuid=True),
                  sa.ForeignKey('agent_runs.id', ondelete='CASCADE'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
        sa.Column('role', sa.String(50), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('tool_name', sa.String(100), nullable=True),
    )


def downgrade() -> None:
    op.drop_table('run_events')
    op.drop_table('agent_runs')
