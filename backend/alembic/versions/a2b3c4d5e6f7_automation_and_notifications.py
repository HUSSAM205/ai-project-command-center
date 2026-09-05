"""automation_rules, automation_logs, notifications (Event Automation Engine & Smart Notifications)

Revision ID: a2b3c4d5e6f7
Revises: f1a2b3c4d5e6
Create Date: 2026-09-05 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'a2b3c4d5e6f7'
down_revision: Union[str, None] = 'f1a2b3c4d5e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'automation_rules',
        sa.Column('organization_id', sa.UUID(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column(
            'trigger_type',
            sa.Enum('TASK_OVERDUE', 'BUDGET_BURNOVER', 'CRITICAL_RISK_SPOTTED', name='automation_trigger_type'),
            nullable=False,
        ),
        sa.Column('condition_json', postgresql.JSONB(), nullable=False),
        sa.Column(
            'action_type',
            sa.Enum('AUTO_CREATE_RISK', 'DISPATCH_NOTIFICATION', 'RECALCULATE_HEALTH', name='automation_action_type'),
            nullable=False,
        ),
        sa.Column('action_params_json', postgresql.JSONB(), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('last_triggered_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_automation_rules_organization_id'), 'automation_rules', ['organization_id'], unique=False)

    op.create_table(
        'automation_logs',
        sa.Column('organization_id', sa.UUID(), nullable=False),
        sa.Column('rule_id', sa.UUID(), nullable=False),
        sa.Column('triggered_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column(
            'outcome',
            sa.Enum('FIRED', 'CONDITION_NOT_MET', 'ERROR', name='automation_outcome'),
            nullable=False,
        ),
        sa.Column('detail', sa.Text(), nullable=True),
        sa.Column('entity_type', sa.String(length=50), nullable=True),
        sa.Column('entity_id', sa.UUID(), nullable=True),
        sa.Column('id', sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['rule_id'], ['automation_rules.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_automation_logs_organization_id'), 'automation_logs', ['organization_id'], unique=False)
    op.create_index(op.f('ix_automation_logs_rule_id'), 'automation_logs', ['rule_id'], unique=False)
    op.create_index(op.f('ix_automation_logs_triggered_at'), 'automation_logs', ['triggered_at'], unique=False)

    op.create_table(
        'notifications',
        sa.Column('organization_id', sa.UUID(), nullable=False),
        sa.Column(
            'category',
            sa.Enum('CRITICAL', 'AI_ALERT', 'WORKFLOW', name='notification_category'),
            nullable=False,
        ),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('message', sa.Text(), nullable=False),
        sa.Column('entity_type', sa.String(length=50), nullable=True),
        sa.Column('entity_id', sa.UUID(), nullable=True),
        sa.Column('is_read', sa.Boolean(), nullable=False),
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_notifications_organization_id'), 'notifications', ['organization_id'], unique=False)
    op.create_index(op.f('ix_notifications_created_at'), 'notifications', ['created_at'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_notifications_created_at'), table_name='notifications')
    op.drop_index(op.f('ix_notifications_organization_id'), table_name='notifications')
    op.drop_table('notifications')
    sa.Enum(name='notification_category').drop(op.get_bind(), checkfirst=True)

    op.drop_index(op.f('ix_automation_logs_triggered_at'), table_name='automation_logs')
    op.drop_index(op.f('ix_automation_logs_rule_id'), table_name='automation_logs')
    op.drop_index(op.f('ix_automation_logs_organization_id'), table_name='automation_logs')
    op.drop_table('automation_logs')
    sa.Enum(name='automation_outcome').drop(op.get_bind(), checkfirst=True)

    op.drop_index(op.f('ix_automation_rules_organization_id'), table_name='automation_rules')
    op.drop_table('automation_rules')
    sa.Enum(name='automation_action_type').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='automation_trigger_type').drop(op.get_bind(), checkfirst=True)
