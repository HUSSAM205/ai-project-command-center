"""Advanced PMO engines (Task 1 of the enterprise-scale PMO overhaul): EVM, RACI matrix,
stage gates, contract ledger / margin leakage, and the boardroom memo generator.

EVM and the boardroom memo have no tables — computed on every read/generate (app/services/evm.py,
app/services/boardroom_memo.py). RACI/stage gates/contract ledger are real CRUD domains backed
by app/models/pmo.py, following the exact org-scoping + require_write_access discipline used by
app/api/risks.py and app/api/budgets.py elsewhere in this app.
"""

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.ai.context import build_project_context
from app.ai.router import AIRouter as AIOrchestrator
from app.ai.router import get_ai_router
from app.api.serializers import serialize_raci
from app.core.database import get_db
from app.core.deps import CurrentPrincipal, get_current_principal, require_write_access
from app.models.enums import StageGateStatus
from app.models.pmo import ContractLedger, RaciEntry, StageGate
from app.repositories.pmo import (
    get_contract_ledger,
    get_raci_entry,
    get_stage_gate,
    list_raci_for_project,
    list_stage_gates_for_project,
)
from app.repositories.projects import get_project
from app.repositories.resources import list_allocations_for_project, list_resources
from app.repositories.tasks import list_tasks_for_project
from app.schemas.pmo import (
    BoardroomMemoOut,
    ContractLedgerOut,
    ContractLedgerUpdate,
    EVMAnomalyOut,
    EVMOut,
    RaciEntryCreate,
    RaciEntryOut,
    RaciEntryUpdate,
    StageGateCreate,
    StageGateOut,
    StageGateUpdate,
    TradeOffOptionOut,
)
from app.services.audit import log_audit_event
from app.services.boardroom_memo import compute_trade_off_options
from app.services.common import compute_planned_pct
from app.services.contract_ledger import compute_contract_ledger_metrics
from app.services.evm import compute_evm

router = APIRouter(prefix="/api/v1", tags=["pmo"])


def _scope_key(principal: CurrentPrincipal) -> str:
    # session_id (unique per anonymous token) takes priority over user_id (the same shared
    # "demo" sentinel for every anonymous visitor) -- see CurrentPrincipal's docstring.
    return f"{principal.organization_id}:{principal.session_id or principal.user_id}"


def _get_project_or_404(db: Session, principal: CurrentPrincipal, project_id: UUID):
    project = get_project(db, principal.organization_id, project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="project not found")
    return project


# ---- EVM ----


@router.get("/projects/{project_id}/evm", response_model=EVMOut)
def get_project_evm(
    project_id: UUID,
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db),
) -> EVMOut:
    project = _get_project_or_404(db, principal, project_id)
    result = compute_evm(project)
    return EVMOut(
        project_id=project_id,
        bac=result.bac,
        pv=result.pv,
        ev=result.ev,
        ac=result.ac,
        cpi=result.cpi,
        spi=result.spi,
        eac=result.eac,
        vac=result.vac,
        planned_pct=result.planned_pct,
        progress=result.progress,
        method=result.method,
        anomalies=[EVMAnomalyOut(metric=a.metric, value=a.value, level=a.level, message=a.message) for a in result.anomalies],
    )


# ---- RACI ----


@router.get("/projects/{project_id}/raci", response_model=list[RaciEntryOut])
def list_project_raci(
    project_id: UUID,
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db),
) -> list[RaciEntryOut]:
    _get_project_or_404(db, principal, project_id)
    entries = list_raci_for_project(db, principal.organization_id, project_id)
    return [serialize_raci(e) for e in entries]


@router.post("/projects/{project_id}/raci", response_model=RaciEntryOut, status_code=status.HTTP_201_CREATED)
def create_project_raci(
    project_id: UUID,
    payload: RaciEntryCreate,
    principal: CurrentPrincipal = Depends(require_write_access),
    db: Session = Depends(get_db),
) -> RaciEntryOut:
    _get_project_or_404(db, principal, project_id)
    entry = RaciEntry(project_id=project_id, **payload.model_dump())
    db.add(entry)
    db.commit()
    db.refresh(entry)
    log_audit_event(
        db,
        organization_id=principal.organization_id,
        actor_user_id=principal.user_id,
        action="raci.created",
        entity_type="raci_entry",
        entity_id=entry.id,
        metadata={"project_id": str(project_id), "task_or_deliverable": entry.task_or_deliverable},
    )
    return serialize_raci(entry)


@router.patch("/raci/{raci_id}", response_model=RaciEntryOut)
def update_raci_entry(
    raci_id: UUID,
    payload: RaciEntryUpdate,
    principal: CurrentPrincipal = Depends(require_write_access),
    db: Session = Depends(get_db),
) -> RaciEntryOut:
    entry = get_raci_entry(db, principal.organization_id, raci_id)
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="RACI entry not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(entry, field, value)
    db.commit()
    db.refresh(entry)
    return serialize_raci(entry)


@router.delete("/raci/{raci_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_raci_entry(
    raci_id: UUID,
    principal: CurrentPrincipal = Depends(require_write_access),
    db: Session = Depends(get_db),
) -> None:
    entry = get_raci_entry(db, principal.organization_id, raci_id)
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="RACI entry not found")
    db.delete(entry)
    db.commit()


# ---- Stage Gates ----


@router.get("/projects/{project_id}/stage-gates", response_model=list[StageGateOut])
def list_project_stage_gates(
    project_id: UUID,
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db),
) -> list[StageGateOut]:
    _get_project_or_404(db, principal, project_id)
    gates = list_stage_gates_for_project(db, principal.organization_id, project_id)
    return [StageGateOut.model_validate(g) for g in gates]


@router.post("/projects/{project_id}/stage-gates", response_model=StageGateOut, status_code=status.HTTP_201_CREATED)
def create_project_stage_gate(
    project_id: UUID,
    payload: StageGateCreate,
    principal: CurrentPrincipal = Depends(require_write_access),
    db: Session = Depends(get_db),
) -> StageGateOut:
    _get_project_or_404(db, principal, project_id)
    gate = StageGate(project_id=project_id, **payload.model_dump())
    if gate.status == StageGateStatus.APPROVED and gate.signed_off_at is None:
        gate.signed_off_at = datetime.now(timezone.utc)
    db.add(gate)
    db.commit()
    db.refresh(gate)
    return StageGateOut.model_validate(gate)


@router.patch("/stage-gates/{stage_gate_id}", response_model=StageGateOut)
def update_stage_gate(
    stage_gate_id: UUID,
    payload: StageGateUpdate,
    principal: CurrentPrincipal = Depends(require_write_access),
    db: Session = Depends(get_db),
) -> StageGateOut:
    """Sign-off is the interesting write here: setting status=APPROVED stamps `signed_off_at`
    server-side (now(), UTC) unless the caller already supplied one, so a sign-off timestamp is
    never client-forgeable — the same "server derives the sensitive timestamp" pattern used for
    created_at/updated_at throughout this app."""
    gate = get_stage_gate(db, principal.organization_id, stage_gate_id)
    if gate is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="stage gate not found")
    data = payload.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(gate, field, value)
    if gate.status == StageGateStatus.APPROVED and gate.signed_off_at is None:
        gate.signed_off_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(gate)
    log_audit_event(
        db,
        organization_id=principal.organization_id,
        actor_user_id=principal.user_id,
        action="stage_gate.updated",
        entity_type="stage_gate",
        entity_id=gate.id,
        metadata={"gate": gate.gate.value, "status": gate.status.value},
    )
    return StageGateOut.model_validate(gate)


# ---- Contract Ledger ----


@router.get("/projects/{project_id}/contract-ledger", response_model=ContractLedgerOut)
def get_project_contract_ledger(
    project_id: UUID,
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db),
) -> ContractLedgerOut:
    project = _get_project_or_404(db, principal, project_id)
    ledger = get_contract_ledger(db, principal.organization_id, project_id)
    metrics = compute_contract_ledger_metrics(project, ledger)
    return ContractLedgerOut(project_id=project_id, **metrics.__dict__)


@router.patch("/projects/{project_id}/contract-ledger", response_model=ContractLedgerOut)
def upsert_project_contract_ledger(
    project_id: UUID,
    payload: ContractLedgerUpdate,
    principal: CurrentPrincipal = Depends(require_write_access),
    db: Session = Depends(get_db),
) -> ContractLedgerOut:
    """Get-or-create-then-update — same upsert shape as app.api.budgets.create_budget_transaction
    lazily creating a Budget row: a project's commercial ledger may not have been seeded yet, so
    the first write creates it rather than 404ing."""
    project = _get_project_or_404(db, principal, project_id)
    ledger = get_contract_ledger(db, principal.organization_id, project_id)
    if ledger is None:
        ledger = ContractLedger(project_id=project_id)
        db.add(ledger)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(ledger, field, value)
    db.commit()
    db.refresh(ledger)
    metrics = compute_contract_ledger_metrics(project, ledger)
    log_audit_event(
        db,
        organization_id=principal.organization_id,
        actor_user_id=principal.user_id,
        action="contract_ledger.updated",
        entity_type="contract_ledger",
        entity_id=ledger.id,
        metadata={"project_id": str(project_id)},
    )
    return ContractLedgerOut(project_id=project_id, **metrics.__dict__)


# ---- Boardroom Memo (generated on demand — no persistence; reports.py has no precedent for
# persisting AI-generated report content either, see its module docstring, so this follows the
# same "compute fresh every call" behavior) ----


@router.post("/projects/{project_id}/boardroom-memo", response_model=BoardroomMemoOut)
def generate_boardroom_memo(
    project_id: UUID,
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db),
    ai_router: AIOrchestrator = Depends(get_ai_router),
) -> BoardroomMemoOut:
    """Generates a fresh steering-committee brief: an AI-narrated executive framing (via
    AIRouter.dispatch, method_name="analyze_project" — the exact same dispatch reports.py's
    executive report uses, see app/api/reports.py::_dispatch_narrative) plus 3 real,
    project-specific trade-off options computed by app/services/boardroom_memo.py from this
    project's real EVM + contract ledger + task data. Nothing is persisted (see module note
    above), so — like GET /api/v1/reports/{type} — this is gated by get_current_principal only,
    not require_write_access: demo/read-only sessions can generate a memo (subject to the same
    tighter anonymous AI rate limit as every other AI-touching read endpoint), the POST verb
    here reflecting "trigger a real AI generation" rather than "mutate stored data"."""
    project = _get_project_or_404(db, principal, project_id)
    tasks = list_tasks_for_project(db, principal.organization_id, project_id)

    evm = compute_evm(project)
    ledger_row = get_contract_ledger(db, principal.organization_id, project_id)
    contract_ledger = compute_contract_ledger_metrics(project, ledger_row)

    allocations = list_allocations_for_project(db, principal.organization_id, project_id)
    resource_ids = {a.resource_id for a in allocations}
    if resource_ids:
        hourly_costs = [float(r.hourly_cost) for r in list_resources(db, principal.organization_id) if r.id in resource_ids]
    else:
        hourly_costs = [float(r.hourly_cost) for r in list_resources(db, principal.organization_id)]

    _planned_pct, total_days, elapsed_days = compute_planned_pct(project.start_date, project.end_date)
    options = compute_trade_off_options(evm, contract_ledger, tasks, hourly_costs, total_days, elapsed_days)

    ai_router.enforce_rate_limit(scope_key=_scope_key(principal), read_only=principal.read_only)
    context = build_project_context(db, principal.organization_id, project)
    narrative = ai_router.dispatch(
        db,
        organization_id=principal.organization_id,
        endpoint=f"/api/v1/projects/{project_id}/boardroom-memo",
        method_name="analyze_project",
        context=context,
    )

    return BoardroomMemoOut(
        project_id=project.id,
        project_name=project.name,
        generated_at=datetime.now(timezone.utc),
        narrative=narrative,
        options=[
            TradeOffOptionOut(
                key=o.key,
                title=o.title,
                description=o.description,
                new_forecast_cost=o.new_forecast_cost,
                variance_vs_budget=o.variance_vs_budget,
                assumptions=o.assumptions,
                details=o.details,
            )
            for o in options
        ],
    )
