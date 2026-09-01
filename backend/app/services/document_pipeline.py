"""Background processing pipeline for an uploaded document: parse -> chunk -> embed -> store.

Runs as a FastAPI BackgroundTask *after* the upload response has already been sent (the
document starts life as PENDING so the frontend can show that status immediately), so it
opens its own DB session rather than reusing the request-scoped one, which is closed by the
time this runs.
"""

import logging
from uuid import UUID

from app.core.database import SessionLocal
from app.models.enums import DocumentStatus
from app.repositories.documents import add_chunks, set_document_status, set_extracted_text
from app.services.document_chunking import chunk_pages, chunk_text
from app.services.document_parser import UnsupportedFileError, parse_document
from app.services.document_storage import read_upload
from app.services.embeddings import embed_texts

logger = logging.getLogger(__name__)


def process_document(document_id: UUID, filename: str, storage_path: str) -> None:
    db = SessionLocal()
    try:
        set_document_status(db, document_id, DocumentStatus.PROCESSING)
        try:
            data = read_upload(storage_path)
            parsed = parse_document(filename, None, data)
            set_extracted_text(db, document_id, parsed.text)

            if not parsed.text.strip():
                set_document_status(
                    db, document_id, DocumentStatus.FAILED, "No extractable text was found in this file."
                )
                return

            if parsed.file_type == "pdf" and len(parsed.pages) > 1:
                chunk_dicts = chunk_pages(parsed.pages)
            else:
                chunk_dicts = [{"content": c, "page_number": None} for c in chunk_text(parsed.text)]

            if not chunk_dicts:
                set_document_status(
                    db, document_id, DocumentStatus.FAILED, "No chunkable text was found in this file."
                )
                return

            vectors = embed_texts([c["content"] for c in chunk_dicts])
            chunk_rows = [
                {
                    "chunk_index": i,
                    "content": c["content"],
                    "embedding": vectors[i],
                    "page_number": c.get("page_number"),
                }
                for i, c in enumerate(chunk_dicts)
            ]
            add_chunks(db, document_id, chunk_rows)
            set_document_status(db, document_id, DocumentStatus.READY)
        except UnsupportedFileError as exc:
            # Shouldn't normally happen (the upload endpoint validates before saving), but
            # handled defensively in case the file on disk doesn't match what was validated.
            set_document_status(db, document_id, DocumentStatus.FAILED, str(exc))
        except Exception as exc:  # noqa: BLE001 - any pipeline failure must land the document in FAILED, not crash the background task silently
            logger.exception("document processing failed for %s", document_id)
            set_document_status(db, document_id, DocumentStatus.FAILED, f"processing failed: {exc}"[:2000])
    finally:
        db.close()
