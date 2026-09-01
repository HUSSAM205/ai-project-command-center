from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import DocumentStatus
from app.schemas.ai import AIResponse


class DocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    project_id: UUID | None
    filename: str
    file_type: str
    uploaded_by: UUID | None
    file_size_bytes: int
    status: DocumentStatus
    error_message: str | None
    created_at: datetime


class DocumentDetailOut(BaseModel):
    """GET /api/v1/documents/{id} — the stored document plus a structured extraction built
    from its real parsed text (see app/services/document_extraction.py / AIRouter.analyze_document).
    `extraction` is null while the document is still PENDING/PROCESSING/FAILED."""

    document: DocumentOut
    extraction: AIResponse | None = None


class DocumentAskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)


class DocumentChunkCitation(BaseModel):
    chunk_index: int
    page_number: int | None
    similarity: float
    excerpt: str
