import uuid
from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import UUIDPKMixin
from app.models.enums import DocumentStatus

EMBEDDING_DIM = 384  # all-MiniLM-L6-v2


class Document(UUIDPKMixin, Base):
    __tablename__ = "documents"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=True, index=True
    )
    filename: Mapped[str] = mapped_column(String(500), nullable=False)
    file_type: Mapped[str] = mapped_column(String(50), nullable=False)  # "pdf" | "docx" | "txt"
    uploaded_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    # Path on local disk under backend/uploads/ (gitignored) — never a cloud bucket, per Phase 3 scope.
    storage_path: Mapped[str] = mapped_column(String(1000), nullable=False)
    file_size_bytes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status: Mapped[DocumentStatus] = mapped_column(
        Enum(DocumentStatus, name="document_status", native_enum=True),
        nullable=False,
        default=DocumentStatus.PENDING,
    )
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Full parsed text, stored alongside the chunks. Lets extraction/analysis work off the
    # exact original text (no chunk-overlap duplication) without re-reading/re-parsing the
    # file from disk on every request.
    extracted_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Set only for a demo/anonymous session's own real upload (see app/api/documents.py's
    # DEMO_UPLOAD_* constants) -- the per-token session_id from CurrentPrincipal, not a user id.
    # Drives three things: the per-session hourly upload budget, hiding one anonymous visitor's
    # upload from every other anonymous visitor sharing the same demo organization (real accounts
    # still see everything), and the lazy TTL cleanup that reaps these rows. Null for every
    # non-demo upload, which is unaffected by any of that.
    uploaded_session_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    project: Mapped["Project | None"] = relationship(viewonly=True)  # noqa: F821
    uploader: Mapped["User | None"] = relationship(viewonly=True)  # noqa: F821
    chunks: Mapped[list["DocumentChunk"]] = relationship(
        back_populates="document", cascade="all, delete-orphan", order_by="DocumentChunk.chunk_index"
    )


class DocumentChunk(UUIDPKMixin, Base):
    __tablename__ = "document_chunks"

    document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    # Local sentence-transformers embedding (all-MiniLM-L6-v2, 384-dim) — never a hosted embedding API.
    embedding: Mapped[list[float]] = mapped_column(Vector(EMBEDDING_DIM), nullable=False)
    page_number: Mapped[int | None] = mapped_column(Integer, nullable=True)

    document: Mapped["Document"] = relationship(back_populates="chunks")
