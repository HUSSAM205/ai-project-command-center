"""ai_requests

Revision ID: a1b2c3d4e5f6
Revises: 6e6ab074b673
Create Date: 2026-09-01 22:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = '6e6ab074b673'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'ai_requests',
        sa.Column('organization_id', sa.UUID(), nullable=False),
        sa.Column('endpoint', sa.String(length=255), nullable=False),
        sa.Column('provider_used', sa.String(length=50), nullable=False),
        sa.Column('success', sa.Boolean(), nullable=False),
        sa.Column('latency_ms', sa.Integer(), nullable=False),
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_ai_requests_organization_id'), 'ai_requests', ['organization_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_ai_requests_organization_id'), table_name='ai_requests')
    op.drop_table('ai_requests')
