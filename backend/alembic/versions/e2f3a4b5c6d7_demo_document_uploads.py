"""documents.uploaded_session_id (rate-limited demo/guest document uploads)

Revision ID: e2f3a4b5c6d7
Revises: 131a14753166
Create Date: 2026-09-04 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e2f3a4b5c6d7'
down_revision: Union[str, None] = '131a14753166'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('documents', sa.Column('uploaded_session_id', sa.String(length=64), nullable=True))
    op.create_index(op.f('ix_documents_uploaded_session_id'), 'documents', ['uploaded_session_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_documents_uploaded_session_id'), table_name='documents')
    op.drop_column('documents', 'uploaded_session_id')
