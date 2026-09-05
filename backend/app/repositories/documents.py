from datetime import datetime
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.document import Document, DocumentChunk
from app.models.enums import DocumentStatus


def _demo_visibility_filter(stmt, session_id: str | None):
    """A demo/anonymous session (session_id set) sees every pre-existing real document plus only
    its OWN ephemeral uploads -- never another anonymous visitor's, since every demo session
    shares one organization_id. A real authenticated caller (session_id None) is unaffected."""
    if session_id is not None:
        stmt = stmt.where(
            (Document.uploaded_session_id.is_(None)) | (Document.uploaded_session_id == session_id)
        )
    return stmt


def list_documents(
    db: Session, organization_id: UUID, project_id: UUID | None = None, *, viewer_session_id: str | None = None
) -> list[Document]:
    stmt = select(Document).where(Document.organization_id == organization_id)
    if project_id is not None:
        stmt = stmt.where(Document.project_id == project_id)
    stmt = _demo_visibility_filter(stmt, viewer_session_id)
    stmt = stmt.order_by(Document.created_at.desc())
    return list(db.scalars(stmt).all())


def get_document(
    db: Session, organization_id: UUID, document_id: UUID, *, viewer_session_id: str | None = None
) -> Document | None:
    stmt = select(Document).where(
        Document.organization_id == organization_id, Document.id == document_id
    )
    stmt = _demo_visibility_filter(stmt, viewer_session_id)
    return db.scalar(stmt)


def create_document(
    db: Session,
    *,
    organization_id: UUID,
    project_id: UUID | None,
    filename: str,
    file_type: str,
    uploaded_by: UUID | None,
    storage_path: str,
    file_size_bytes: int,
    uploaded_session_id: str | None = None,
) -> Document:
    document = Document(
        organization_id=organization_id,
        project_id=project_id,
        filename=filename,
        file_type=file_type,
        uploaded_by=uploaded_by,
        storage_path=storage_path,
        file_size_bytes=file_size_bytes,
        status=DocumentStatus.PENDING,
        uploaded_session_id=uploaded_session_id,
    )
    db.add(document)
    db.commit()
    db.refresh(document)
    return document


def count_recent_demo_uploads(db: Session, session_id: str, since: datetime) -> int:
    """Backs the per-session hourly demo-upload budget. Deliberately a direct DB count rather
    than the Redis-backed limiter app/ai/router.py uses: Upstash isn't connected in this
    deployment yet (see docs/DEPLOYMENT_HANDOVER.md), and enforce_rate_limit fails OPEN when
    Redis is unreachable -- fine for a read, but an upload consumes real disk and background
    compute, so this budget needs to hold even with no cache configured at all."""
    stmt = select(func.count()).select_from(Document).where(
        Document.uploaded_session_id == session_id, Document.created_at >= since
    )
    return db.scalar(stmt) or 0


def list_expired_demo_documents(db: Session, before: datetime) -> list[Document]:
    stmt = select(Document).where(
        Document.uploaded_session_id.is_not(None), Document.created_at < before
    )
    return list(db.scalars(stmt).all())


def list_stuck_processing_documents(db: Session, before: datetime) -> list[Document]:
    """Documents whose background pipeline (process_document) never reported back -- see
    app/api/documents.py's stuck-processing reconciliation for why this can happen even though
    nothing in the pipeline itself hangs."""
    stmt = select(Document).where(
        Document.status.in_([DocumentStatus.PENDING, DocumentStatus.PROCESSING]),
        Document.created_at < before,
    )
    return list(db.scalars(stmt).all())


def fail_stuck_processing_documents(db: Session, before: datetime, message: str) -> None:
    """Marks every PENDING/PROCESSING document created before `before` as FAILED with `message`.
    Shared by two independent reconciliation passes with different cutoffs and wording:
    app/api/documents.py's lazy per-request reap (a few minutes' grace, since a real pipeline run
    might just be slow) and app/main.py's startup sweep (cutoff = the moment the process booted,
    since nothing could legitimately still be in progress the instant a fresh process starts)."""
    for document in list_stuck_processing_documents(db, before):
        set_document_status(db, document.id, DocumentStatus.FAILED, message)


def delete_document(db: Session, document: Document) -> None:
    db.delete(document)  # document_chunks cascade via ondelete=CASCADE
    db.commit()


def set_document_status(
    db: Session, document_id: UUID, status: DocumentStatus, error_message: str | None = None
) -> None:
    document = db.get(Document, document_id)
    if document is None:
        return
    document.status = status
    document.error_message = error_message
    db.commit()


def set_extracted_text(db: Session, document_id: UUID, text: str) -> None:
    document = db.get(Document, document_id)
    if document is None:
        return
    document.extracted_text = text
    db.commit()


def add_chunks(db: Session, document_id: UUID, chunks: list[dict]) -> None:
    """chunks: [{"chunk_index": int, "content": str, "embedding": list[float], "page_number": int | None}]"""
    for c in chunks:
        db.add(
            DocumentChunk(
                document_id=document_id,
                chunk_index=c["chunk_index"],
                content=c["content"],
                embedding=c["embedding"],
                page_number=c.get("page_number"),
            )
        )
    db.commit()


def list_chunks(db: Session, document_id: UUID) -> list[DocumentChunk]:
    stmt = (
        select(DocumentChunk)
        .where(DocumentChunk.document_id == document_id)
        .order_by(DocumentChunk.chunk_index)
    )
    return list(db.scalars(stmt).all())


def search_similar_chunks(
    db: Session, document_id: UUID, query_embedding: list[float], limit: int = 5
) -> list[tuple[DocumentChunk, float]]:
    """Returns (chunk, cosine_similarity) pairs, most similar first. pgvector's
    cosine_distance is 1 - cosine_similarity, so similarity = 1 - distance."""
    distance = DocumentChunk.embedding.cosine_distance(query_embedding)
    stmt = (
        select(DocumentChunk, distance.label("distance"))
        .where(DocumentChunk.document_id == document_id)
        .order_by(distance)
        .limit(limit)
    )
    rows = db.execute(stmt).all()
    return [(row[0], 1.0 - float(row[1])) for row in rows]
