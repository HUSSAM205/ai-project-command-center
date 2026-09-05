"""audit_logs governance columns: session_id, actor_email, ip_address, tamper-evident hash chain

Revision ID: b3c4d5e6f7a8
Revises: a2b3c4d5e6f7
Create Date: 2026-09-05 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b3c4d5e6f7a8'
down_revision: Union[str, None] = 'a2b3c4d5e6f7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('audit_logs', sa.Column('session_id', sa.String(length=64), nullable=True))
    op.add_column('audit_logs', sa.Column('actor_email', sa.String(length=255), nullable=True))
    op.add_column('audit_logs', sa.Column('ip_address', sa.String(length=64), nullable=True))
    # Tamper-evident hash chain -- both columns null on every existing row (they predate this
    # feature and are honestly excluded from continuity verification, not backfilled with a fake
    # chain computed after the fact).
    op.add_column('audit_logs', sa.Column('record_hash', sa.String(length=64), nullable=True))
    op.add_column('audit_logs', sa.Column('prev_hash', sa.String(length=64), nullable=True))


def downgrade() -> None:
    op.drop_column('audit_logs', 'prev_hash')
    op.drop_column('audit_logs', 'record_hash')
    op.drop_column('audit_logs', 'ip_address')
    op.drop_column('audit_logs', 'actor_email')
    op.drop_column('audit_logs', 'session_id')
