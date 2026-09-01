"""RBAC (permissions/role_permissions), audit_logs, feedback (Phase 5)

Revision ID: c3d4e5f6a7b8
Revises: b7c8d9e0f1a2
Create Date: 2026-09-02 00:00:00.000000

"""
import uuid
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


# revision identifiers, used by Alembic.
revision: str = 'c3d4e5f6a7b8'
down_revision: Union[str, None] = 'b7c8d9e0f1a2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Static permission catalog + per-role grants, seeded here (not in app/seed.py, which only
# owns the demo *organization's* data) so a fresh checkout has working RBAC immediately after
# `alembic upgrade head`, regardless of whether the demo seed script has ever run.
PERMISSION_DEFS = [
    ("admin.access", "Reach the /admin/* panel and its API endpoints"),
    ("project.write", "Create and update projects"),
    ("task.write", "Create, update, and assign tasks"),
    ("risk.write", "Create and update risks"),
    ("budget.write", "Record budget transactions"),
    ("document.upload", "Upload documents"),
]

ROLE_GRANTS = {
    "ADMIN": ["admin.access", "project.write", "task.write", "risk.write", "budget.write", "document.upload"],
    "MANAGER": ["project.write", "task.write", "risk.write", "budget.write", "document.upload"],
    "MEMBER": ["task.write", "document.upload"],
    "VIEWER": [],
}


def upgrade() -> None:
    op.create_table(
        'permissions',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('key', sa.String(length=100), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('key'),
    )
    op.create_index(op.f('ix_permissions_key'), 'permissions', ['key'], unique=True)

    op.create_table(
        'role_permissions',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('role', sa.String(length=20), nullable=False),
        sa.Column('permission_id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['permission_id'], ['permissions.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('role', 'permission_id', name='uq_role_permission'),
    )
    op.create_index(op.f('ix_role_permissions_role'), 'role_permissions', ['role'], unique=False)

    op.create_table(
        'audit_logs',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('organization_id', sa.UUID(), nullable=False),
        sa.Column('actor_user_id', sa.UUID(), nullable=True),
        sa.Column('action', sa.String(length=100), nullable=False),
        sa.Column('entity_type', sa.String(length=50), nullable=False),
        sa.Column('entity_id', sa.UUID(), nullable=True),
        sa.Column('metadata', JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['actor_user_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_audit_logs_organization_id'), 'audit_logs', ['organization_id'], unique=False)
    op.create_index(op.f('ix_audit_logs_actor_user_id'), 'audit_logs', ['actor_user_id'], unique=False)
    op.create_index(op.f('ix_audit_logs_action'), 'audit_logs', ['action'], unique=False)
    op.create_index(op.f('ix_audit_logs_entity_type'), 'audit_logs', ['entity_type'], unique=False)
    op.create_index(op.f('ix_audit_logs_created_at'), 'audit_logs', ['created_at'], unique=False)

    op.create_table(
        'feedback',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('organization_id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=True),
        sa.Column('message', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_feedback_organization_id'), 'feedback', ['organization_id'], unique=False)

    # ---- seed the permission catalog + default role grants ----
    permissions_table = sa.table(
        'permissions',
        sa.column('id', sa.UUID()),
        sa.column('key', sa.String()),
        sa.column('description', sa.Text()),
    )
    permission_ids: dict[str, uuid.UUID] = {key: uuid.uuid4() for key, _ in PERMISSION_DEFS}
    op.bulk_insert(
        permissions_table,
        [{'id': permission_ids[key], 'key': key, 'description': desc} for key, desc in PERMISSION_DEFS],
    )

    role_permissions_table = sa.table(
        'role_permissions',
        sa.column('id', sa.UUID()),
        sa.column('role', sa.String()),
        sa.column('permission_id', sa.UUID()),
    )
    grant_rows = [
        {'id': uuid.uuid4(), 'role': role, 'permission_id': permission_ids[key]}
        for role, keys in ROLE_GRANTS.items()
        for key in keys
    ]
    if grant_rows:
        op.bulk_insert(role_permissions_table, grant_rows)


def downgrade() -> None:
    op.drop_index(op.f('ix_feedback_organization_id'), table_name='feedback')
    op.drop_table('feedback')

    op.drop_index(op.f('ix_audit_logs_created_at'), table_name='audit_logs')
    op.drop_index(op.f('ix_audit_logs_entity_type'), table_name='audit_logs')
    op.drop_index(op.f('ix_audit_logs_action'), table_name='audit_logs')
    op.drop_index(op.f('ix_audit_logs_actor_user_id'), table_name='audit_logs')
    op.drop_index(op.f('ix_audit_logs_organization_id'), table_name='audit_logs')
    op.drop_table('audit_logs')

    op.drop_index(op.f('ix_role_permissions_role'), table_name='role_permissions')
    op.drop_table('role_permissions')

    op.drop_index(op.f('ix_permissions_key'), table_name='permissions')
    op.drop_table('permissions')
