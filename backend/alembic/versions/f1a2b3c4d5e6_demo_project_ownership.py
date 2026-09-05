"""projects.created_by_session_id (demo sessions get real write access to their own projects)

Revision ID: f1a2b3c4d5e6
Revises: e2f3a4b5c6d7
Create Date: 2026-09-05 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f1a2b3c4d5e6'
down_revision: Union[str, None] = 'e2f3a4b5c6d7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('projects', sa.Column('created_by_session_id', sa.String(length=64), nullable=True))
    op.create_index(op.f('ix_projects_created_by_session_id'), 'projects', ['created_by_session_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_projects_created_by_session_id'), table_name='projects')
    op.drop_column('projects', 'created_by_session_id')
