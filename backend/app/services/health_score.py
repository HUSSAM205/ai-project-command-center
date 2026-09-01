"""Deterministic project Health Score.

Formula reference: docs/PRODUCT_REQUIREMENTS.md ("Health Score"). No randomness, no AI calls.
Subtracts clamped penalties (schedule/budget/task/risk/resource/dependency) from 100.
"""

from dataclasses import dataclass
from datetime import date

from app.models.enums import RiskLevel, RiskStatus, TaskStatus
from app.models.project import Project
from app.models.risk import Risk
from app.models.task import Task
from app.services.common import clamp


@dataclass
class HealthScoreResult:
    health_score: int
    risk_level: RiskLevel
    planned_pct: float
    avg_task_completion: float
    breakdown: dict[str, float]


def derive_risk_level(health_score: int) -> RiskLevel:
    if health_score >= 80:
        return RiskLevel.LOW
    if health_score >= 60:
        return RiskLevel.MEDIUM
    if health_score >= 40:
        return RiskLevel.HIGH
    return RiskLevel.CRITICAL


def compute_health_score(
    project: Project,
    tasks: list[Task],
    risks: list[Risk],
    overloaded_resource_count: int,
    today: date | None = None,
) -> HealthScoreResult:
    today = today or date.today()

    if project.start_date and project.end_date:
        total_days = max(1, (project.end_date - project.start_date).days)
        elapsed_days = clamp((today - project.start_date).days, 0, total_days)
    else:
        total_days = 1
        elapsed_days = 0
    planned_pct = 100.0 * elapsed_days / total_days

    progress = project.progress or 0
    schedule_penalty = clamp((planned_pct - progress) * 0.6, 0, 30)

    expected_spend_pct = planned_pct / 100.0
    budget = float(project.budget or 0)
    actual_cost = float(project.actual_cost or 0)
    actual_spend_pct = (actual_cost / budget) if budget > 0 else 0.0
    budget_penalty = clamp((actual_spend_pct - expected_spend_pct) * 40, 0, 25)

    if tasks:
        avg_task_completion = sum(t.completion_percentage or 0 for t in tasks) / len(tasks)
    else:
        avg_task_completion = float(progress)
    task_penalty = clamp((planned_pct - avg_task_completion) * 0.3, 0, 15)

    active_risk_scores = sorted(
        (r.probability * r.impact for r in risks if r.status in (RiskStatus.OPEN, RiskStatus.MITIGATING)),
        reverse=True,
    )
    top3_risk_scores = active_risk_scores[:3]
    risk_penalty = clamp(sum(top3_risk_scores) * 0.5, 0, 20)

    resource_penalty = clamp(overloaded_resource_count * 4, 0, 12)

    blocked_count = sum(1 for t in tasks if t.status == TaskStatus.BLOCKED)
    dependency_penalty = clamp(blocked_count * 3, 0, 12)

    total_penalty = (
        schedule_penalty + budget_penalty + task_penalty + risk_penalty + resource_penalty + dependency_penalty
    )
    health_score = int(round(clamp(100 - total_penalty, 0, 100)))
    risk_level = derive_risk_level(health_score)

    return HealthScoreResult(
        health_score=health_score,
        risk_level=risk_level,
        planned_pct=round(planned_pct, 2),
        avg_task_completion=round(avg_task_completion, 2),
        breakdown={
            "schedule_penalty": round(schedule_penalty, 2),
            "budget_penalty": round(budget_penalty, 2),
            "task_penalty": round(task_penalty, 2),
            "risk_penalty": round(risk_penalty, 2),
            "resource_penalty": round(resource_penalty, 2),
            "dependency_penalty": round(dependency_penalty, 2),
            "total_penalty": round(total_penalty, 2),
        },
    )
