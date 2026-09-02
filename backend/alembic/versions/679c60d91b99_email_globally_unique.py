"""email globally unique

Revision ID: 679c60d91b99
Revises: d4e5f6a7b8c9
Create Date: 2026-09-02 07:19:17.789411

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '679c60d91b99'
down_revision: Union[str, None] = 'd4e5f6a7b8c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Email moves from per-organization uniqueness to globally unique — see
    # app/models/user.py for why (login has no org-disambiguation step; a shared email across
    # two orgs let login silently resolve to the wrong account's password hash).
    # (Note: alembic autogenerate also proposed dropping/recreating 'permissions_key_key' —
    # that's unrelated pre-existing metadata noise from the Phase 5 migration, not a real diff
    # from this change, so it's deliberately left out here.)
    op.drop_constraint('uq_users_org_email', 'users', type_='unique')
    op.drop_index('ix_users_email', table_name='users')
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=True)


def downgrade() -> None:
    op.drop_index(op.f('ix_users_email'), table_name='users')
    op.create_index('ix_users_email', 'users', ['email'], unique=False)
    op.create_unique_constraint('uq_users_org_email', 'users', ['organization_id', 'email'])
