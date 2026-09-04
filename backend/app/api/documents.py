import asyncio
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.ai.router import AIRouter, get_ai_router
from app.core.database import get_db
from app.core.deps import CurrentPrincipal, get_current_principal
from app.models.enums import DocumentStatus
from app.repositories.documents import (
    count_recent_demo_uploads,
    create_document,
    delete_document,
    get_document,
    list_documents,
    list_expired_demo_documents,
    list_stuck_processing_documents,
    search_similar_chunks,
    set_document_status,
)
from app.repositories.projects import get_project
from app.schemas.ai import AIResponse
from app.schemas.document import DocumentAskRequest, DocumentDetailOut, DocumentOut
from app.services.audit import log_audit_event
from app.services.document_parser import UnsupportedFileError, detect_file_type
from app.services.document_pipeline import process_document
from app.services.document_storage import delete_upload, save_upload
from app.services.embeddings import embed_text

router = APIRouter(prefix="/api/v1/documents", tags=["documents"])

TOP_K_CHUNKS = 5

# A real upload consumes disk and background parse/embed compute, unlike a read -- so a demo/
# anonymous session gets its own narrow, real (not simulated) upload path instead of the flat 403
# require_write_access gives every other mutation: a small hourly budget, a much lower size cap
# than the real 20MB limit, and a short TTL so ephemeral guest files don't accumulate forever in
# the shared demo organization. Real accounts (require_write_access) are completely unaffected.
DEMO_UPLOAD_LIMIT_PER_HOUR = 3
DEMO_UPLOAD_MAX_BYTES = 2 * 1024 * 1024  # 2MB
DEMO_UPLOAD_TTL_MINUTES = 60

# process_document runs as a plain FastAPI BackgroundTask -- there is no durable queue behind it
# (confirmed: no ARQ/Celery/RQ anywhere in this codebase or its dependencies), so it is not
# resumable. If this single Uvicorn worker's process restarts (e.g. Render reclaiming memory)
# between "upload response sent" and "background task actually runs", the task is gone -- nothing
# in process_document itself can detect or recover from that, because it never runs at all. This
# is the honest floor: a document can't be *guaranteed* to finish, but it can be guaranteed to
# never sit in PROCESSING forever. Generous relative to how fast this pipeline actually runs (a
# tiny text file embeds in well under a second) specifically so a large real PDF's legitimately
# longer parse/chunk/embed time is never mistaken for a lost task.
PROCESSING_STUCK_MINUTES = 3


def _scope_key(principal: CurrentPrincipal) -> str:
    # session_id (unique per anonymous token) takes priority over user_id (the same shared
    # "demo" sentinel for every anonymous visitor) -- see CurrentPrincipal's docstring.
    return f"{principal.organization_id}:{principal.session_id or principal.user_id}"


def _cleanup_expired_demo_uploads(db: Session) -> None:
    """Lazy TTL reap, run on the hot read/write paths below rather than a scheduled job (this
    deployment has no task scheduler). Best-effort disk cleanup, real DB cleanup -- a file that's
    already gone (Render's disk is ephemeral across deploys) is not an error."""
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=DEMO_UPLOAD_TTL_MINUTES)
    for document in list_expired_demo_documents(db, cutoff):
        delete_upload(document.storage_path)
        delete_document(db, document)


def _fail_stuck_processing_documents(db: Session) -> None:
    """See PROCESSING_STUCK_MINUTES above. Same lazy-reconciliation shape as the demo-upload TTL
    reap: no scheduler in this deployment, so this runs on the read paths that would otherwise
    just keep showing a document stuck on PENDING/PROCESSING indefinitely."""
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=PROCESSING_STUCK_MINUTES)
    for document in list_stuck_processing_documents(db, cutoff):
        set_document_status(
            db,
            document.id,
            DocumentStatus.FAILED,
            "Processing did not complete in time -- the background worker may have restarted "
            "mid-task. Try uploading the file again.",
        )


@router.post("", response_model=DocumentOut, status_code=status.HTTP_201_CREATED)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    project_id: UUID | None = Form(None),
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db),
) -> DocumentOut:
    """Uploads and indexes a document (PDF/DOCX/TXT). A real, authenticated write-access account
    gets the full 20MB limit with no extra checks (unchanged). A demo/anonymous session
    (principal.session_id set) instead gets a narrow real-upload path gated by
    DEMO_UPLOAD_LIMIT_PER_HOUR/DEMO_UPLOAD_MAX_BYTES/DEMO_UPLOAD_TTL_MINUTES above — everyone else
    still gets a flat 403. Parsing, chunking, and local embedding happen in a background task; the
    document starts PENDING and the frontend polls GET /documents(/{id}) to watch it move to
    PROCESSING -> READY|FAILED, exactly the same pipeline either way.

    This route is `async def` (needed for `await file.read()` below), which means -- unlike every
    other route in this file, which is a plain `def` FastAPI auto-offloads to a worker thread --
    nothing in its body gets threadpool protection for free. This single Uvicorn worker's event
    loop stays blocked for the full duration of any synchronous call made directly in an `async
    def` handler, which under real load can starve every other in-flight request (including a
    concurrent /health check) for as long as the disk write and DB commits below take. Every
    blocking call here is explicitly run via asyncio.to_thread so this route behaves the same as
    the sync ones instead of being the one exception."""
    is_demo = principal.session_id is not None
    if not is_demo and principal.read_only:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="read-only access")

    if is_demo:
        await asyncio.to_thread(_cleanup_expired_demo_uploads, db)
        since = datetime.now(timezone.utc) - timedelta(hours=1)
        recent_count = await asyncio.to_thread(count_recent_demo_uploads, db, principal.session_id, since)
        if recent_count >= DEMO_UPLOAD_LIMIT_PER_HOUR:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Demo upload limit reached ({DEMO_UPLOAD_LIMIT_PER_HOUR}/hour). Try again later.",
            )

    if project_id is not None:
        project = await asyncio.to_thread(get_project, db, principal.organization_id, project_id)
        if project is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="project not found")

    data = await file.read()
    if is_demo and len(data) > DEMO_UPLOAD_MAX_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Demo uploads are limited to {DEMO_UPLOAD_MAX_BYTES // (1024 * 1024)}MB. Get full account access for larger files.",
        )
    try:
        file_type = detect_file_type(file.filename or "upload", file.content_type, data)
    except UnsupportedFileError as exc:
        raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail=str(exc)) from exc

    storage_path = await asyncio.to_thread(save_upload, principal.organization_id, file.filename or "upload", data)

    document = await asyncio.to_thread(
        create_document,
        db,
        organization_id=principal.organization_id,
        project_id=project_id,
        filename=file.filename or "upload",
        file_type=file_type,
        uploaded_by=UUID(principal.user_id) if _looks_like_uuid(principal.user_id) else None,
        storage_path=storage_path,
        file_size_bytes=len(data),
        uploaded_session_id=principal.session_id if is_demo else None,
    )

    background_tasks.add_task(process_document, document.id, document.filename, document.storage_path)

    await asyncio.to_thread(
        log_audit_event,
        db,
        organization_id=principal.organization_id,
        actor_user_id=principal.user_id,
        action="document.uploaded",
        entity_type="document",
        entity_id=document.id,
        metadata={
            "filename": document.filename,
            "file_type": document.file_type,
            "size_bytes": len(data),
            "demo_upload": is_demo,
        },
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
    _cleanup_expired_demo_uploads(db)
    _fail_stuck_processing_documents(db)
    documents = list_documents(db, principal.organization_id, project_id, viewer_session_id=principal.session_id)
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
    _fail_stuck_processing_documents(db)
    document = get_document(db, principal.organization_id, document_id, viewer_session_id=principal.session_id)
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="document not found")

    extraction: AIResponse | None = None
    if document.status == DocumentStatus.READY:
        # This page polls every few seconds while a document is processing (frontend/app/app/
        # documents/[id]/page.tsx) and keeps rendering normally for a while after it reaches
        # READY too -- an unchanged filename/text means an unchanged cache key, so a repeat view
        # of the same document is a real cache hit, not a new AI request. Charging the rate limit
        # for it would drain a visitor's whole hourly budget on nothing but re-reading one answer.
        extraction_context = {"filename": document.filename, "text": document.extracted_text or ""}
        if not ai_router.is_cached(
            organization_id=principal.organization_id, method_name="analyze_document", context=extraction_context
        ):
            ai_router.enforce_rate_limit(scope_key=_scope_key(principal), read_only=principal.read_only)
        extraction = ai_router.dispatch(
            db,
            organization_id=principal.organization_id,
            endpoint=f"/api/v1/documents/{document_id}",
            method_name="analyze_document",
            context=extraction_context,
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
    document = get_document(db, principal.organization_id, document_id, viewer_session_id=principal.session_id)
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="document not found")
    if document.status != DocumentStatus.READY:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"document is not ready for Q&A yet (status: {document.status.value})",
        )

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
    ask_context = {"question": payload.question, "filename": document.filename, "chunks": chunks}
    # Same question against the same (deterministic, local) retrieval -> same cache key -> a real
    # cache hit, not a new request. See the matching comment on get_document_detail above.
    if not ai_router.is_cached(
        organization_id=principal.organization_id, method_name="answer_document_question", context=ask_context
    ):
        ai_router.enforce_rate_limit(scope_key=_scope_key(principal), read_only=principal.read_only)

    response = ai_router.dispatch(
        db,
        organization_id=principal.organization_id,
        endpoint=f"/api/v1/documents/{document_id}/ask",
        method_name="answer_document_question",
        context=ask_context,
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
