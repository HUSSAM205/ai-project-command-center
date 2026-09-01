from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.document import Document, DocumentChunk
from app.models.enums import DocumentStatus


def list_documents(db: Session, organization_id: UUID, project_id: UUID | None = None) -> list[Document]:
    stmt = select(Document).where(Document.organization_id == organization_id)
    if project_id is not None:
        stmt = stmt.where(Document.project_id == project_id)
    stmt = stmt.order_by(Document.created_at.desc())
    return list(db.scalars(stmt).all())


def get_document(db: Session, organization_id: UUID, document_id: UUID) -> Document | None:
    stmt = select(Document).where(
        Document.organization_id == organization_id, Document.id == document_id
    )
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
    )
    db.add(document)
    db.commit()
    db.refresh(document)
    return document


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
