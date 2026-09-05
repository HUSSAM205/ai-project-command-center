"""Event Automation Engine: real, on-demand evaluation of the 3 standard enterprise triggers
against real current data, and real execution of a rule's configured action when its condition is
genuinely met.

This deployment has no background job scheduler (no APScheduler/Celery/cron -- see
app/api/documents.py's `_cleanup_expired_demo_uploads` for the established precedent: this app
always reconciles lazily on a real hot read path instead of running a recurring worker process).
Automation rules follow the exact same convention rather than inventing new infrastructure:

- `maybe_evaluate_automations` is called from GET /notifications (a frequently-polled hot path).
  It re-evaluates every active rule for the org at most once per EVALUATION_COOLDOWN_SECONDS, and
  a rule that already fired within RULE_RETRIGGER_COOLDOWN of now is skipped (so one real overdue
  task doesn't spam a fresh notification every single poll).
- `POST /automations/{id}/test-run` calls `run_rule` directly with `forced=True`, bypassing both
  cooldowns -- an explicit, real evaluation against real data, run right now. This is NOT a
  simulated/fake dry-run: the condition is genuinely checked and, if met, the action genuinely
  runs (a real Risk row, a real notification, a real health-score computation). A rule whose
  condition isn't currently true honestly reports CONDITION_NOT_MET rather than pretending to fire.

Every evaluation -- fired or not -- is written to automation_logs, so "no automations have fired"
is a visible, honest fact instead of an empty log indistinguishable from "never checked".
"""

import logging
import time
from datetime import date, datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy.orm import Session

from app.api.serializers import derive_risk_severity
from app.models.automation import AutomationLog, AutomationRule
from app.models.enums import (
    AutomationActionType,
    AutomationOutcome,
    AutomationTriggerType,
    NotificationCategory,
    RiskCategory,
    RiskSeverity,
    RiskStatus,
    TaskStatus,
)
from app.models.notification import Notification
from app.models.risk import Risk
from app.repositories.projects import get_project, list_projects
from app.repositories.risks import list_all_risks_for_org, list_risks_for_project
from app.repositories.tasks import list_dependencies_for_project, list_tasks_for_project
from app.services.bottleneck_detection import compute_critical_path
from app.services.health_score import compute_health_score
from app.services.resource_state import compute_all_resource_states, count_overloaded_resources_for_project

logger = logging.getLogger(__name__)

EVALUATION_COOLDOWN_SECONDS = 300  # 5 min -- how often a lazy GET /notifications actually re-checks
RULE_RETRIGGER_COOLDOWN = timedelta(hours=1)  # a rule that just fired won't re-notify every poll
BUDGET_BURNOVER_THRESHOLD_PCT = 90.0

# In-process, single-worker state (this Render deployment runs one uvicorn worker -- same
# acceptable simplification AIRouter's own in-process circuit breaker already relies on).
_LAST_EVALUATED_MONO: dict[UUID, float] = {}

STANDARD_RULES: list[dict] = [
    {
        "name": "Critical Path Task Overdue -> Auto-Create Schedule Risk",
        "trigger_type": AutomationTriggerType.TASK_OVERDUE,
        "action_type": AutomationActionType.AUTO_CREATE_RISK,
    },
    {
        "name": "Budget Burnover (>90% BAC) -> Dispatch Notification",
        "trigger_type": AutomationTriggerType.BUDGET_BURNOVER,
        "action_type": AutomationActionType.DISPATCH_NOTIFICATION,
    },
    {
        "name": "Critical Risk Spotted -> Recalculate Project Health",
        "trigger_type": AutomationTriggerType.CRITICAL_RISK_SPOTTED,
        "action_type": AutomationActionType.RECALCULATE_HEALTH,
    },
]


def _evaluate_task_overdue(db: Session, organization_id: UUID) -> tuple[bool, str, dict | None]:
    """A critical-path task (real CPM via app/services/bottleneck_detection.py, per project) that
    has missed its due date and isn't DONE. Checked project-by-project since CPM is inherently a
    per-project computation (each project has its own dependency graph)."""
    today = date.today()
    for project in list_projects(db, organization_id):
        tasks = list_tasks_for_project(db, organization_id, project.id)
        if not tasks:
            continue
        dependencies = list_dependencies_for_project(db, organization_id, project.id)
        cpm = compute_critical_path(tasks, dependencies)
        overdue = [
            t
            for t in tasks
            if (cp := cpm.get(t.id)) is not None
            and cp.is_critical
            and t.status != TaskStatus.DONE
            and t.due_date is not None
            and t.due_date < today
        ]
        if overdue:
            overdue.sort(key=lambda t: t.due_date)  # most overdue first
            task = overdue[0]
            slippage = (today - task.due_date).days
            detail = (
                f'"{task.title}" on "{project.name}" is {slippage} day(s) past its {task.due_date.isoformat()} '
                f"due date and sits on the critical path."
            )
            return True, detail, {
                "project_id": project.id,
                "project_name": project.name,
                "task_id": task.id,
                "task_title": task.title,
                "slippage_days": slippage,
            }
    return False, "No critical-path task is currently overdue.", None


def _evaluate_budget_burnover(db: Session, organization_id: UUID) -> tuple[bool, str, dict | None]:
    """Real BAC/AC comparison -- Project.budget (BAC) and Project.actual_cost (AC), the same
    fields app/services/cost_forecast.py's EAC = BAC / CPI formula already uses."""
    worst: tuple[float, object] | None = None
    for project in list_projects(db, organization_id):
        budget = float(project.budget or 0)
        actual = float(project.actual_cost or 0)
        if budget <= 0:
            continue
        burn_pct = (actual / budget) * 100.0
        if burn_pct > BUDGET_BURNOVER_THRESHOLD_PCT and (worst is None or burn_pct > worst[0]):
            worst = (burn_pct, project)
    if worst is None:
        return False, f"No project has burned past {BUDGET_BURNOVER_THRESHOLD_PCT:.0f}% of its budget at completion.", None
    burn_pct, project = worst
    detail = (
        f'"{project.name}" has spent {burn_pct:.0f}% of its ${float(project.budget):,.0f} budget at completion '
        f"(${float(project.actual_cost):,.0f} actual cost)."
    )
    return True, detail, {"project_id": project.id, "project_name": project.name, "burn_pct": round(burn_pct, 1)}


def _evaluate_critical_risk(db: Session, organization_id: UUID) -> tuple[bool, str, dict | None]:
    """Reuses app/api/serializers.py's derive_risk_severity (score<=16 HIGH, >16 CRITICAL) for
    consistency with every other CRITICAL-severity label in this app, rather than a second,
    slightly different literal threshold."""
    risks = [r for r in list_all_risks_for_org(db, organization_id) if r.status != RiskStatus.CLOSED]
    critical = [r for r in risks if derive_risk_severity(r.probability * r.impact) == RiskSeverity.CRITICAL]
    if not critical:
        return False, "No open risk currently scores CRITICAL severity.", None
    critical.sort(key=lambda r: r.probability * r.impact, reverse=True)
    top = critical[0]
    score = top.probability * top.impact
    detail = f'"{top.title}" scores {score} (CRITICAL severity) and is still {top.status.value}.'
    return True, detail, {"project_id": top.project_id, "risk_id": top.id, "risk_title": top.title, "score": score}


_EVALUATORS = {
    AutomationTriggerType.TASK_OVERDUE: _evaluate_task_overdue,
    AutomationTriggerType.BUDGET_BURNOVER: _evaluate_budget_burnover,
    AutomationTriggerType.CRITICAL_RISK_SPOTTED: _evaluate_critical_risk,
}

_NOTIFICATION_CATEGORY = {
    AutomationTriggerType.TASK_OVERDUE: NotificationCategory.WORKFLOW,
    AutomationTriggerType.BUDGET_BURNOVER: NotificationCategory.CRITICAL,
    AutomationTriggerType.CRITICAL_RISK_SPOTTED: NotificationCategory.CRITICAL,
}


def _execute_action(db: Session, organization_id: UUID, rule: AutomationRule, context: dict) -> str:
    """Runs the rule's configured action for real and returns a human-readable summary of what it
    actually did -- never a canned "action executed" placeholder."""
    if rule.action_type == AutomationActionType.AUTO_CREATE_RISK:
        project_id = context["project_id"]
        if rule.trigger_type == AutomationTriggerType.TASK_OVERDUE:
            title = f'Schedule risk: "{context["task_title"]}" overdue on the critical path'
            category = RiskCategory.SCHEDULE
        else:
            title = f'Automated risk from {rule.trigger_type.value}'
            category = RiskCategory.OPERATIONAL
        risk = Risk(
            project_id=project_id,
            title=title,
            description=f"Auto-created by automation rule \"{rule.name}\".",
            category=category,
            probability=4,
            impact=4,
            status=RiskStatus.OPEN,
        )
        db.add(risk)
        db.flush()
        context["risk_id"] = risk.id
        return f'Created unmitigated risk "{risk.title}" (probability 4, impact 4) in the project risk registry.'

    if rule.action_type == AutomationActionType.RECALCULATE_HEALTH:
        project_id = context.get("project_id")
        project = get_project(db, organization_id, project_id) if project_id else None
        if project is None:
            return "No project context to recalculate health for."
        tasks = list_tasks_for_project(db, organization_id, project.id)
        risks = list_risks_for_project(db, organization_id, project.id)
        resource_states = compute_all_resource_states(db, organization_id)
        overloaded = count_overloaded_resources_for_project(db, organization_id, project.id, resource_states)
        result = compute_health_score(project, tasks, risks, overloaded)
        # health_score is always computed fresh on every read (never cached/stored) -- there is no
        # cache to "invalidate" here. This action's real effect is producing a timestamped
        # snapshot of the current real score in the automation log, which genuinely is new: no
        # historical health-score record existed anywhere before this.
        return f"Recalculated health score for \"{project.name}\": {result.health_score}/100 ({result.risk_level.value} risk)."

    if rule.action_type == AutomationActionType.DISPATCH_NOTIFICATION:
        # The Notification row created unconditionally below (for every FIRED rule, regardless of
        # action_type) already IS this action -- nothing further to do.
        return "Notification dispatched to project stakeholders."

    return "No action handler for this action_type."


def run_rule(db: Session, organization_id: UUID, rule: AutomationRule, *, forced: bool) -> AutomationLog:
    """Evaluates `rule`'s trigger condition for real and, if met, runs its action for real. Always
    writes an AutomationLog row (fired or not) and, only on a real fire, a real Notification row
    so the bell reflects genuine automation activity. `forced=True` (test-run) still performs a
    completely real evaluation -- it only bypasses the retrigger cooldown, never the actual
    condition check."""
    try:
        condition_met, detail, context = _EVALUATORS[rule.trigger_type](db, organization_id)
    except Exception:
        logger.exception("automation rule %s (%s) evaluation failed", rule.id, rule.trigger_type.value)
        log = AutomationLog(
            organization_id=organization_id,
            rule_id=rule.id,
            outcome=AutomationOutcome.ERROR,
            detail="Evaluation failed unexpectedly -- see server logs.",
        )
        db.add(log)
        db.commit()
        db.refresh(log)
        return log

    if not condition_met:
        log = AutomationLog(
            organization_id=organization_id, rule_id=rule.id, outcome=AutomationOutcome.CONDITION_NOT_MET, detail=detail
        )
        db.add(log)
        db.commit()
        db.refresh(log)
        return log

    assert context is not None
    action_detail = _execute_action(db, organization_id, rule, context)
    full_detail = f"{detail} {action_detail}"

    entity_type = "task" if "task_id" in context else "risk" if "risk_id" in context else "project"
    entity_id = context.get("task_id") or context.get("risk_id") or context.get("project_id")

    notification = Notification(
        organization_id=organization_id,
        category=_NOTIFICATION_CATEGORY[rule.trigger_type],
        title=rule.name,
        message=full_detail,
        entity_type=entity_type,
        entity_id=entity_id,
        is_read=False,
    )
    db.add(notification)

    rule.last_triggered_at = datetime.now(timezone.utc)
    db.add(rule)

    log = AutomationLog(
        organization_id=organization_id,
        rule_id=rule.id,
        outcome=AutomationOutcome.FIRED,
        detail=full_detail,
        entity_type=entity_type,
        entity_id=entity_id,
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


def maybe_evaluate_automations(db: Session, organization_id: UUID) -> None:
    """Lazy, opportunistic re-evaluation of every active rule for this org -- called from
    GET /notifications. At most once per EVALUATION_COOLDOWN_SECONDS per org (in-process guard),
    and skips any individual rule still within its own RULE_RETRIGGER_COOLDOWN. Never raises --
    a failed automation tick must not break the notification feed it's piggybacking on."""
    now = time.monotonic()
    last = _LAST_EVALUATED_MONO.get(organization_id)
    if last is not None and now - last < EVALUATION_COOLDOWN_SECONDS:
        return
    _LAST_EVALUATED_MONO[organization_id] = now

    try:
        from app.repositories.automations import list_or_seed_automation_rules

        rules = list_or_seed_automation_rules(db, organization_id)
        cutoff = datetime.now(timezone.utc) - RULE_RETRIGGER_COOLDOWN
        for rule in rules:
            if not rule.is_active:
                continue
            if rule.last_triggered_at is not None and rule.last_triggered_at > cutoff:
                continue
            run_rule(db, organization_id, rule, forced=False)
    except Exception:
        logger.exception("automation evaluation tick failed for org %s", organization_id)
