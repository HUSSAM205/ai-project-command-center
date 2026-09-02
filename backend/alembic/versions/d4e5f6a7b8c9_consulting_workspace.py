"""AI Consulting Workspace: business_cases, ai_opportunities, roadmap_phases (Phase 4)

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-09-02 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


# revision identifiers, used by Alembic.
revision: str = 'd4e5f6a7b8c9'
down_revision: Union[str, None] = 'c3d4e5f6a7b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

ROADMAP_PHASE_TYPE_VALUES = ("DISCOVERY", "DATA_READINESS", "PILOT", "IMPLEMENTATION", "SCALE")


def upgrade() -> None:
    # Inline sa.Enum(...) in the Column below — SQLAlchemy auto-creates the Postgres type as
    # part of create_table's own DDL (same pattern as every enum in the initial migration,
    # e.g. 6e6ab074b673_initial_schema.py). No separate explicit CREATE TYPE step needed since
    # this type is only used by this one table.
    roadmap_phase_type = sa.Enum(*ROADMAP_PHASE_TYPE_VALUES, name="roadmap_phase_type")

    op.create_table(
        'business_cases',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('organization_id', sa.UUID(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('business_problem', sa.Text(), nullable=False),
        sa.Column('current_state', sa.Text(), nullable=False),
        sa.Column('desired_state', sa.Text(), nullable=False),
        sa.Column('objectives', sa.Text(), nullable=False),
        sa.Column('constraints', sa.Text(), nullable=True),
        sa.Column('stakeholders', sa.Text(), nullable=True),
        sa.Column('budget', sa.Numeric(precision=14, scale=2), nullable=False, server_default='0'),
        sa.Column('timeline', sa.String(length=255), nullable=True),
        sa.Column('created_by', sa.UUID(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_business_cases_organization_id'), 'business_cases', ['organization_id'], unique=False)

    op.create_table(
        'ai_opportunities',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('business_case_id', sa.UUID(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('business_impact', sa.Integer(), nullable=False),
        sa.Column('feasibility', sa.Integer(), nullable=False),
        sa.Column('data_readiness', sa.Integer(), nullable=False),
        sa.Column('cost', sa.Integer(), nullable=False),
        sa.Column('time_to_value', sa.Integer(), nullable=False),
        sa.Column('risk', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint('business_impact BETWEEN 1 AND 5', name='ck_ai_opportunities_business_impact_range'),
        sa.CheckConstraint('feasibility BETWEEN 1 AND 5', name='ck_ai_opportunities_feasibility_range'),
        sa.CheckConstraint('data_readiness BETWEEN 1 AND 5', name='ck_ai_opportunities_data_readiness_range'),
        sa.CheckConstraint('cost BETWEEN 1 AND 5', name='ck_ai_opportunities_cost_range'),
        sa.CheckConstraint('time_to_value BETWEEN 1 AND 5', name='ck_ai_opportunities_time_to_value_range'),
        sa.CheckConstraint('risk BETWEEN 1 AND 5', name='ck_ai_opportunities_risk_range'),
        sa.ForeignKeyConstraint(['business_case_id'], ['business_cases.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_ai_opportunities_business_case_id'), 'ai_opportunities', ['business_case_id'], unique=False)

    op.create_table(
        'roadmap_phases',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('business_case_id', sa.UUID(), nullable=False),
        sa.Column('phase', roadmap_phase_type, nullable=False),
        sa.Column('objectives', JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column('deliverables', JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column('kpis', JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column('risks', JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column('duration_weeks', sa.Integer(), nullable=False),
        sa.Column('resources', JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column('budget', sa.Numeric(precision=14, scale=2), nullable=False, server_default='0'),
        sa.Column('sequence_order', sa.Integer(), nullable=False),
        sa.Column('source', sa.String(length=20), nullable=False, server_default='demo_ai'),
        sa.ForeignKeyConstraint(['business_case_id'], ['business_cases.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_roadmap_phases_business_case_id'), 'roadmap_phases', ['business_case_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_roadmap_phases_business_case_id'), table_name='roadmap_phases')
    op.drop_table('roadmap_phases')

    op.drop_index(op.f('ix_ai_opportunities_business_case_id'), table_name='ai_opportunities')
    op.drop_table('ai_opportunities')

    op.drop_index(op.f('ix_business_cases_organization_id'), table_name='business_cases')
    op.drop_table('business_cases')

    sa.Enum(*ROADMAP_PHASE_TYPE_VALUES, name="roadmap_phase_type").drop(op.get_bind(), checkfirst=True)
