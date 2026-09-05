from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.ai.router import AIRouter, get_ai_router
from app.core.database import get_db
from app.core.deps import CurrentPrincipal, get_current_principal, require_write_access
from app.models.enums import TaskStatus
from app.models.resource import Resource
from app.models.task import Task
from app.repositories.projects import get_project
from app.repositories.resources import list_resources
from app.schemas.ai import AIResponse
from app.schemas.meeting import MeetingActionItemIn, MeetingCommitRequest, MeetingCommitResponse, MeetingParseRequest
from app.services.audit import log_audit_event

router = APIRouter(prefix="/api/v1/meetings", tags=["meetings"])


def _scope_key(principal: CurrentPrincipal) -> str:
    # Same pattern as app/api/documents.py's _scope_key -- session_id (unique per anonymous
    # token) takes priority over user_id (a shared "demo" sentinel for every anonymous visitor).
    return f"{principal.organization_id}:{principal.session_id or principal.user_id}"


def _resolve_owner(owner_name: str | None, resources: list[Resource]) -> Resource | None:
    """Case-insensitive match against this org's real Resource names. An exact full-name match
    wins outright; otherwise a first-name-only mention ("Sarah will draft the doc") resolves only
    if it identifies exactly one resource -- an ambiguous or unmatched name is left unresolved
    (task created unassigned) rather than guessed, since a wrong assignee is worse than none."""
    if not owner_name:
        return None
    name_lower = owner_name.strip().lower()
    if not name_lower:
        return None
    for r in resources:
        if r.name.lower() == name_lower:
            return r
    candidates = [
        r for r in resources if name_lower in r.name.lower().split() or r.name.lower() == name_lower
    ]
    return candidates[0] if len(candidates) == 1 else None


@router.post("/parse-transcript", response_model=AIResponse)
def parse_transcript(
    payload: MeetingParseRequest,
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db),
    ai_router: AIRouter = Depends(get_ai_router),
) -> AIResponse:
    """Meeting Intelligence: extracts decisions/action_items/risks_identified from a pasted
    transcript -- app/services/meeting_extraction.py's heuristic parser in Demo AI mode, or a
    JSON-mode prompt (app/ai/prompts/meeting_intelligence.py) against a live provider. A read/
    analysis action (not a mutation), so it's available to demo/read-only tokens, subject to the
    same AI rate limit as document Q&A and the assistant."""
    context = {"transcript": payload.transcript, "today": date.today().isoformat()}
    if not ai_router.is_cached(
        organization_id=principal.organization_id, method_name="parse_meeting_transcript", context=context
    ):
        ai_router.enforce_rate_limit(scope_key=_scope_key(principal), read_only=principal.read_only)

    response = ai_router.dispatch(
        db,
        organization_id=principal.organization_id,
        endpoint="/api/v1/meetings/parse-transcript",
        method_name="parse_meeting_transcript",
        context=context,
    )
    log_audit_event(
        db,
        organization_id=principal.organization_id,
        actor_user_id=principal.user_id,
        action="ai.request",
        entity_type="ai_request",
        metadata={"endpoint": "/api/v1/meetings/parse-transcript", "provider": response.source},
    )
    return response


@router.post("/commit-tasks", response_model=MeetingCommitResponse, status_code=status.HTTP_201_CREATED)
def commit_tasks(
    payload: MeetingCommitRequest,
    principal: CurrentPrincipal = Depends(require_write_access),
    db: Session = Depends(get_db),
) -> MeetingCommitResponse:
    """One-click action-item promotion: each approved action item becomes a real Task row in
    `payload.project_id`, via the exact same Task model/columns as a normal
    POST /projects/{id}/tasks create -- no parallel task-creation path. Gated by
    require_write_access like every other task mutation (no demo-write path here, matching
    create_task in app/api/tasks.py)."""
    if get_project(db, principal.organization_id, payload.project_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="project not found")

    resources = list_resources(db, principal.organization_id)
    unresolved_owners: list[str] = []
    created: list[Task] = []

    for item in payload.action_items:
        resource = _resolve_owner(item.owner_name, resources)
        if item.owner_name and resource is None:
            unresolved_owners.append(item.owner_name)
        task = Task(
            project_id=payload.project_id,
            title=item.title,
            description=item.description,
            assignee_id=resource.id if resource else None,
            status=TaskStatus.TODO,
            priority=item.priority,
            due_date=item.due_date,
            estimated_hours=item.estimated_hours,
        )
        db.add(task)
        created.append(task)

    db.commit()
    for task in created:
        db.refresh(task)

    log_audit_event(
        db,
        organization_id=principal.organization_id,
        actor_user_id=principal.user_id,
        action="meeting.tasks_committed",
        entity_type="project",
        entity_id=payload.project_id,
        metadata={"count": len(created), "unresolved_owners": sorted(set(unresolved_owners))},
    )
    return MeetingCommitResponse(created_tasks=created, unresolved_owners=sorted(set(unresolved_owners)))
