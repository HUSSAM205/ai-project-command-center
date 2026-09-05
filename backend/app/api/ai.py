import asyncio
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.ai.context import build_assistant_context, build_portfolio_context
from app.ai.router import AIRouter, get_ai_router
from app.core.database import get_db
from app.core.deps import CurrentPrincipal, get_current_principal
from app.repositories.projects import get_project
from app.schemas.ai import AIResponse
from app.services.audit import log_audit_event
from app.services.chat_attachment import extract_chat_attachment_text
from app.services.document_parser import UnsupportedFileError

router = APIRouter(prefix="/api/v1/ai", tags=["ai"])


def _scope_key(principal: CurrentPrincipal) -> str:
    # session_id (unique per anonymous token) takes priority over user_id (the same shared
    # "demo" sentinel for every anonymous visitor) -- see CurrentPrincipal's docstring.
    return f"{principal.organization_id}:{principal.session_id or principal.user_id}"


@router.get("/executive-brief", response_model=AIResponse)
def get_executive_brief(
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db),
    ai_router: AIRouter = Depends(get_ai_router),
) -> AIResponse:
    """Org-scoped portfolio-wide brief. Demo/read-only tokens can call this (it's a read,
    not a mutation) — subject to the tighter anonymous rate limit."""
    ai_router.enforce_rate_limit(scope_key=_scope_key(principal), read_only=principal.read_only)
    context = build_portfolio_context(db, principal.organization_id)
    response = ai_router.dispatch(
        db,
        organization_id=principal.organization_id,
        endpoint="/api/v1/ai/executive-brief",
        method_name="generate_report",
        context=context,
    )
    log_audit_event(
        db,
        organization_id=principal.organization_id,
        actor_user_id=principal.user_id,
        action="ai.request",
        entity_type="ai_request",
        metadata={"endpoint": "/api/v1/ai/executive-brief", "provider": response.source},
    )
    return response


@router.post("/assistant", response_model=AIResponse)
async def ask_assistant(
    question: str = Form(..., min_length=1, max_length=2000),
    project_id: UUID | None = Form(None),
    file: UploadFile | None = File(None),
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db),
    ai_router: AIRouter = Depends(get_ai_router),
) -> AIResponse:
    """Natural-language Q&A over the org's real data. Demo/read-only tokens can call this —
    it's a read/analysis action, not a data mutation, so it is not gated behind
    require_write_access.

    `file` is an optional attachment (PDF/DOCX/TXT/CSV/JSON) sent with this one question --
    multipart/form-data rather than a JSON body specifically so this route can accept it. Its
    text is extracted transiently (app/services/chat_attachment.py) and folded into the prompt
    context; nothing is written to the documents/document_chunks tables. This route is `async
    def` only for `await file.read()` below, same reasoning as documents.py's upload_document --
    every other blocking call in this handler stays wrapped in asyncio.to_thread so the event
    loop is never blocked for the duration of this request."""
    await asyncio.to_thread(ai_router.enforce_rate_limit, scope_key=_scope_key(principal), read_only=principal.read_only)

    project = None
    if project_id is not None:
        project = await asyncio.to_thread(get_project, db, principal.organization_id, project_id)
        if project is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="project not found")

    attached_document = None
    if file is not None:
        data = await file.read()
        try:
            attached_document = await asyncio.to_thread(
                extract_chat_attachment_text, file.filename or "attachment", file.content_type, data
            )
        except UnsupportedFileError as exc:
            raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail=str(exc)) from exc

    context = await asyncio.to_thread(
        build_assistant_context, db, principal.organization_id, question, project, attached_document
    )
    response = await asyncio.to_thread(
        ai_router.dispatch,
        db,
        organization_id=principal.organization_id,
        endpoint="/api/v1/ai/assistant",
        method_name="answer_project_question",
        context=context,
    )
    await asyncio.to_thread(
        log_audit_event,
        db,
        organization_id=principal.organization_id,
        actor_user_id=principal.user_id,
        action="ai.request",
        entity_type="ai_request",
        entity_id=project.id if project else None,
        metadata={
            "endpoint": "/api/v1/ai/assistant",
            "provider": response.source,
            "attachment": attached_document["filename"] if attached_document else None,
        },
    )
    return response
