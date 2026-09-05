from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import CurrentPrincipal, get_current_principal, require_write_access
from app.repositories.automations import get_automation_rule, list_automation_logs, list_or_seed_automation_rules
from app.schemas.automation import AutomationLogOut, AutomationRuleOut
from app.services.audit import log_audit_event
from app.services.automation_engine import run_rule

router = APIRouter(prefix="/api/v1/automations", tags=["automations"])


def _get_rule_or_404(db: Session, organization_id: UUID, rule_id: UUID):
    rule = get_automation_rule(db, organization_id, rule_id)
    if rule is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="automation rule not found")
    return rule


@router.get("", response_model=list[AutomationRuleOut])
def list_automations(
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db),
) -> list[AutomationRuleOut]:
    """The org's configured automation workflows -- the 3 standard enterprise triggers, provisioned
    for this org on first read if they don't exist yet (see
    app/repositories/automations.py::list_or_seed_automation_rules)."""
    rules = list_or_seed_automation_rules(db, principal.organization_id)
    return [AutomationRuleOut.model_validate(r) for r in rules]


@router.post("/{rule_id}/toggle", response_model=AutomationRuleOut)
def toggle_automation(
    rule_id: UUID,
    request: Request,
    principal: CurrentPrincipal = Depends(require_write_access),
    db: Session = Depends(get_db),
) -> AutomationRuleOut:
    rule = _get_rule_or_404(db, principal.organization_id, rule_id)
    rule.is_active = not rule.is_active
    db.commit()
    db.refresh(rule)
    log_audit_event(
        db,
        organization_id=principal.organization_id,
        actor_user_id=principal.user_id,
        action="automation.toggled",
        entity_type="automation_rule",
        entity_id=rule.id,
        metadata={"is_active": rule.is_active},
        request=request,
        actor_email=principal.email,
        session_id=principal.session_id,
    )
    return AutomationRuleOut.model_validate(rule)


@router.post("/{rule_id}/test-run", response_model=AutomationLogOut)
def test_run_automation(
    rule_id: UUID,
    request: Request,
    principal: CurrentPrincipal = Depends(require_write_access),
    db: Session = Depends(get_db),
) -> AutomationLogOut:
    """Explicitly, on-demand evaluates this rule's real trigger condition against real current
    data right now (bypassing the retrigger cooldown, never the condition check itself), and runs
    its real configured action if the condition is genuinely met -- see
    app/services/automation_engine.py::run_rule's docstring for exactly what "forced" changes and
    what it doesn't."""
    rule = _get_rule_or_404(db, principal.organization_id, rule_id)
    log = run_rule(db, principal.organization_id, rule, forced=True)
    log_audit_event(
        db,
        organization_id=principal.organization_id,
        actor_user_id=principal.user_id,
        action="automation.test_run",
        entity_type="automation_rule",
        entity_id=rule.id,
        metadata={"outcome": log.outcome.value},
        request=request,
        actor_email=principal.email,
        session_id=principal.session_id,
    )
    return AutomationLogOut.model_validate(log)


@router.get("/{rule_id}/logs", response_model=list[AutomationLogOut])
def get_automation_logs(
    rule_id: UUID,
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db),
) -> list[AutomationLogOut]:
    """Execution Audit Log: every past real evaluation of this rule, fired or not, most recent
    first."""
    _get_rule_or_404(db, principal.organization_id, rule_id)
    logs = list_automation_logs(db, principal.organization_id, rule_id)
    return [AutomationLogOut.model_validate(l) for l in logs]
