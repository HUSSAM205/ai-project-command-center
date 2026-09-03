from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.ai.router import AIRouter, get_ai_router
from app.core.database import get_db
from app.core.deps import CurrentPrincipal, get_current_principal, require_write_access
from app.models.enums import DocumentStatus
from app.repositories.documents import (
    create_document,
    get_document,
    list_documents,
    search_similar_chunks,
)
from app.repositories.projects import get_project
from app.schemas.ai import AIResponse
from app.schemas.document import DocumentAskRequest, DocumentDetailOut, DocumentOut
from app.services.audit import log_audit_event
from app.services.document_parser import UnsupportedFileError, detect_file_type
from app.services.document_pipeline import process_document
from app.services.document_storage import save_upload
from app.services.embeddings import embed_text

router = APIRouter(prefix="/api/v1/documents", tags=["documents"])

TOP_K_CHUNKS = 5


def _scope_key(principal: CurrentPrincipal) -> str:
    # session_id (unique per anonymous token) takes priority over user_id (the same shared
    # "demo" sentinel for every anonymous visitor) -- see CurrentPrincipal's docstring.
    return f"{principal.organization_id}:{principal.session_id or principal.user_id}"


@router.post("", response_model=DocumentOut, status_code=status.HTTP_201_CREATED)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    project_id: UUID | None = Form(None),
    principal: CurrentPrincipal = Depends(require_write_access),
    db: Session = Depends(get_db),
) -> DocumentOut:
    """Uploads and indexes a document (PDF/DOCX/TXT, 20MB max). Upload is a write, so this
    is gated behind require_write_access — demo/read-only tokens get 403. Parsing, chunking,
    and local embedding happen in a background task; the document starts PENDING and the
    frontend polls GET /documents(/{id}) to watch it move to PROCESSING -> READY|FAILED."""
    if project_id is not None and get_project(db, principal.organization_id, project_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="project not found")

    data = await file.read()
    try:
        file_type = detect_file_type(file.filename or "upload", file.content_type, data)
    except UnsupportedFileError as exc:
        raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail=str(exc)) from exc

    storage_path = save_upload(principal.organization_id, file.filename or "upload", data)

    document = create_document(
        db,
        organization_id=principal.organization_id,
        project_id=project_id,
        filename=file.filename or "upload",
        file_type=file_type,
        uploaded_by=UUID(principal.user_id) if _looks_like_uuid(principal.user_id) else None,
        storage_path=storage_path,
        file_size_bytes=len(data),
    )

    background_tasks.add_task(process_document, document.id, document.filename, document.storage_path)

    log_audit_event(
        db,
        organization_id=principal.organization_id,
        actor_user_id=principal.user_id,
        action="document.uploaded",
        entity_type="document",
        entity_id=document.id,
        metadata={"filename": document.filename, "file_type": document.file_type, "size_bytes": len(data)},
    )

    return DocumentOut.model_validate(document)


def _looks_like_uuid(value: str) -> bool:
    try:
        UUID(value)
        return True
    except (ValueError, TypeError):
        return False


@router.get("", response_model=list[DocumentOut])
def list_all_documents(
    project_id: UUID | None = None,
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db),
) -> list[DocumentOut]:
    documents = list_documents(db, principal.organization_id, project_id)
    return [DocumentOut.model_validate(d) for d in documents]


@router.get("/{document_id}", response_model=DocumentDetailOut)
def get_document_detail(
    document_id: UUID,
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db),
    ai_router: AIRouter = Depends(get_ai_router),
) -> DocumentDetailOut:
    """Returns the document plus a structured extraction (requirements, deliverables,
    dates, risks, action items, missing information) built from its real parsed text via
    AIRouter.analyze_document. Extraction is null until the document reaches READY."""
    document = get_document(db, principal.organization_id, document_id)
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="document not found")

    extraction: AIResponse | None = None
    if document.status == DocumentStatus.READY:
        ai_router.enforce_rate_limit(scope_key=_scope_key(principal), read_only=principal.read_only)
        extraction = ai_router.dispatch(
            db,
            organization_id=principal.organization_id,
            endpoint=f"/api/v1/documents/{document_id}",
            method_name="analyze_document",
            context={"filename": document.filename, "text": document.extracted_text or ""},
        )
        log_audit_event(
            db,
            organization_id=principal.organization_id,
            actor_user_id=principal.user_id,
            action="ai.request",
            entity_type="ai_request",
            entity_id=document.id,
            metadata={"endpoint": f"/api/v1/documents/{document_id}", "provider": extraction.source},
        )

    return DocumentDetailOut(document=DocumentOut.model_validate(document), extraction=extraction)


@router.post("/{document_id}/ask", response_model=AIResponse)
def ask_document_question(
    document_id: UUID,
    payload: DocumentAskRequest,
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db),
    ai_router: AIRouter = Depends(get_ai_router),
) -> AIResponse:
    """Grounded Q&A over one document: pgvector cosine-similarity retrieval over its chunks,
    then AIRouter.answer_document_question. A read/analysis action (not a mutation), so it's
    available to demo/read-only tokens like /api/v1/ai/assistant is, subject to the same
    tighter anonymous AI rate limit."""
    document = get_document(db, principal.organization_id, document_id)
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="document not found")
    if document.status != DocumentStatus.READY:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"document is not ready for Q&A yet (status: {document.status.value})",
        )

    ai_router.enforce_rate_limit(scope_key=_scope_key(principal), read_only=principal.read_only)

    query_embedding = embed_text(payload.question)
    results = search_similar_chunks(db, document_id, query_embedding, limit=TOP_K_CHUNKS)
    chunks = [
        {
            "chunk_index": chunk.chunk_index,
            "page_number": chunk.page_number,
            "content": chunk.content,
            "similarity": similarity,
        }
        for chunk, similarity in results
    ]

    response = ai_router.dispatch(
        db,
        organization_id=principal.organization_id,
        endpoint=f"/api/v1/documents/{document_id}/ask",
        method_name="answer_document_question",
        context={"question": payload.question, "filename": document.filename, "chunks": chunks},
    )
    log_audit_event(
        db,
        organization_id=principal.organization_id,
        actor_user_id=principal.user_id,
        action="ai.request",
        entity_type="ai_request",
        entity_id=document.id,
        metadata={"endpoint": f"/api/v1/documents/{document_id}/ask", "provider": response.source},
    )
    return response
