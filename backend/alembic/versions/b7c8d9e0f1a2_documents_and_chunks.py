"""documents and document_chunks (Phase 3 Document Intelligence / RAG)

Revision ID: b7c8d9e0f1a2
Revises: a1b2c3d4e5f6
Create Date: 2026-09-02 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector


# revision identifiers, used by Alembic.
revision: str = 'b7c8d9e0f1a2'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute('CREATE EXTENSION IF NOT EXISTS vector')

    op.create_table(
        'documents',
        sa.Column('organization_id', sa.UUID(), nullable=False),
        sa.Column('project_id', sa.UUID(), nullable=True),
        sa.Column('filename', sa.String(length=500), nullable=False),
        sa.Column('file_type', sa.String(length=50), nullable=False),
        sa.Column('uploaded_by', sa.UUID(), nullable=True),
        sa.Column('storage_path', sa.String(length=1000), nullable=False),
        sa.Column('file_size_bytes', sa.Integer(), nullable=False),
        sa.Column(
            'status',
            sa.Enum('PENDING', 'PROCESSING', 'READY', 'FAILED', name='document_status'),
            nullable=False,
        ),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('extracted_text', sa.Text(), nullable=True),
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['uploaded_by'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_documents_organization_id'), 'documents', ['organization_id'], unique=False)
    op.create_index(op.f('ix_documents_project_id'), 'documents', ['project_id'], unique=False)

    op.create_table(
        'document_chunks',
        sa.Column('document_id', sa.UUID(), nullable=False),
        sa.Column('chunk_index', sa.Integer(), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('embedding', Vector(384), nullable=False),
        sa.Column('page_number', sa.Integer(), nullable=True),
        sa.Column('id', sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(['document_id'], ['documents.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_document_chunks_document_id'), 'document_chunks', ['document_id'], unique=False)
    # No ANN index (ivfflat/hnsw) yet: retrieval is always scoped to one document's chunks
    # (a handful to a few hundred rows), so an exact brute-force cosine scan via
    # `<=>` is both simpler and fast enough at this scale. Add one later if cross-document
    # portfolio-wide search is introduced.


def downgrade() -> None:
    op.drop_index(op.f('ix_document_chunks_document_id'), table_name='document_chunks')
    op.drop_table('document_chunks')
    op.drop_index(op.f('ix_documents_project_id'), table_name='documents')
    op.drop_index(op.f('ix_documents_organization_id'), table_name='documents')
    op.drop_table('documents')
    sa.Enum(name='document_status').drop(op.get_bind(), checkfirst=True)
