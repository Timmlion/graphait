"""v2: config-as-code — drop agent tables, string FKs, add user.agent_id

Revision ID: a1b2c3d4e5f6
Revises: 3263943a1511
Create Date: 2026-04-26
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = '3263943a1511'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Drop tables that depend on agents first
    # Check if they exist — some may have been dropped in previous migrations
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()

    for table in ['agent_schedules', 'agent_relationships', 'agents']:
        if table in existing_tables:
            op.drop_table(table)

    # Change tasks.assignee_id and creator_id from UUID FK to String(100)
    with op.batch_alter_table('tasks', recreate='always') as batch_op:
        batch_op.alter_column('assignee_id',
            existing_type=sa.Uuid(as_uuid=True),
            type_=sa.String(100),
            existing_nullable=True, nullable=True)
        batch_op.alter_column('creator_id',
            existing_type=sa.Uuid(as_uuid=True),
            type_=sa.String(100),
            existing_nullable=False, nullable=True)

    # Change comments.author_id from UUID FK to String(100)
    with op.batch_alter_table('comments', recreate='always') as batch_op:
        batch_op.alter_column('author_id',
            existing_type=sa.Uuid(as_uuid=True),
            type_=sa.String(100),
            existing_nullable=False, nullable=True)

    # Add agent_id to users
    if 'users' in existing_tables:
        user_columns = [c['name'] for c in inspector.get_columns('users')]
        if 'agent_id' not in user_columns:
            op.add_column('users', sa.Column('agent_id', sa.String(100), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'agent_id')
