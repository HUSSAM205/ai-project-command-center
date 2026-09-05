"""Portfolio-wide AI Workload Balancer.

For every resource currently over the same over-allocation threshold the Resources page already
displays (frontend/app/app/resources/page.tsx's OVER_ALLOCATION_THRESHOLD_PCT), finds their real
incomplete assigned tasks and suggests moving the one that most relieves their overload to a
genuinely qualified, meaningfully-available alternative -- reusing the same explainable ranking
(app/services/resource_optimization.py) and the same "don't suggest someone with zero real skill
overlap just because they're cheap/available" guard already established in
app/services/bottleneck_detection.py. A candidate is only ever suggested if taking the task would
land THEM at or under MAX_RESULTING_UTILIZATION_PCT -- moving an overload onto someone else's plate
isn't a fix.
"""

from dataclasses import dataclass
from datetime import date
from uuid import UUID

from app.models.enums import TaskStatus, UtilizationState
from app.models.resource import Resource
from app.models.task import Task
from app.services.resource_optimization import rank_candidates

OVERLOAD_THRESHOLD_PCT = 110.0  # matches the Resources page's existing OVER_ALLOCATION_THRESHOLD_PCT
MAX_RESULTING_UTILIZATION_PCT = 75.0
DEFAULT_TASK_ESTIMATE_HOURS = 8.0  # mirrors monte_carlo.py's own default for a task with no estimate


def _weekly_hours_for_task(task: Task, today: date) -> float:
    """A task's `estimated_hours` is its TOTAL effort, which can span months -- adding it directly
    to a resource's WEEKLY workload figure would be a unit mismatch (a 1,600-hour task isn't a
    1,600-hour-per-week addition). Spreads the real remaining effort over the task's real
    remaining duration instead, the same "remaining work over remaining time" idea
    app/services/monte_carlo.py's _remaining_hours already applies per project."""
    estimated = float(task.estimated_hours) if task.estimated_hours else DEFAULT_TASK_ESTIMATE_HOURS
    remaining_hours = max(0.0, estimated * (1 - (task.completion_percentage or 0) / 100.0))
    if task.due_date and task.due_date > today:
        remaining_weeks = max(1.0, (task.due_date - today).days / 7.0)
    else:
        remaining_weeks = 1.0
    return remaining_hours / remaining_weeks


@dataclass
class BalanceSuggestion:
    task_id: UUID
    task_title: str
    from_resource_id: UUID
    from_resource_name: str
    from_utilization_pct: float
    to_resource_id: UUID
    to_resource_name: str
    to_utilization_pct_before: float
    to_utilization_pct_after: float
    explanation: str


def suggest_portfolio_balance(
    resources: list[Resource],
    tasks: list[Task],
    resource_states: dict[UUID, tuple[float, UtilizationState]],
    today: date | None = None,
) -> list[BalanceSuggestion]:
    today = today or date.today()
    resources_by_id = {r.id: r for r in resources}
    workloads = {rid: wl for rid, (wl, _s) in resource_states.items()}

    def utilization_pct(resource: Resource) -> float:
        capacity = float(resource.capacity_hours_per_week or 0)
        if capacity <= 0:
            return 0.0
        return workloads.get(resource.id, 0.0) / capacity * 100.0

    overloaded = [r for r in resources if utilization_pct(r) > OVERLOAD_THRESHOLD_PCT]
    # Worst-overloaded first, so if the UI only surfaces the first few suggestions the most
    # urgent cases are the ones shown.
    overloaded.sort(key=utilization_pct, reverse=True)

    suggestions: list[BalanceSuggestion] = []
    for resource in overloaded:
        from_util_pct = utilization_pct(resource)
        their_tasks = [t for t in tasks if t.assignee_id == resource.id and t.status != TaskStatus.DONE]
        # Try the task that would relieve the most weekly load first -- reassigning it is the
        # highest-leverage single move for this person's overload.
        their_tasks.sort(key=lambda t: _weekly_hours_for_task(t, today), reverse=True)

        for task in their_tasks:
            ranked = rank_candidates(task.required_skills, resources, workloads)
            ranked = [c for c in ranked if c.resource_id != str(resource.id)]
            qualified = [c for c in ranked if not task.required_skills or c.skill_match_pct > 0]

            task_hours = _weekly_hours_for_task(task, today)
            chosen = None
            for c in qualified:
                candidate = resources_by_id.get(UUID(c.resource_id))
                if candidate is None:
                    continue
                candidate_capacity = float(candidate.capacity_hours_per_week or 0)
                if candidate_capacity <= 0:
                    continue
                before_pct = workloads.get(candidate.id, 0.0) / candidate_capacity * 100.0
                after_pct = (workloads.get(candidate.id, 0.0) + task_hours) / candidate_capacity * 100.0
                if after_pct <= MAX_RESULTING_UTILIZATION_PCT:
                    chosen = (c, before_pct, after_pct)
                    break  # `qualified` is already best-first; the first one clearing the bar wins

            if chosen is None:
                continue
            candidate_score, before_pct, after_pct = chosen
            suggestions.append(
                BalanceSuggestion(
                    task_id=task.id,
                    task_title=task.title,
                    from_resource_id=resource.id,
                    from_resource_name=resource.name,
                    from_utilization_pct=round(from_util_pct, 1),
                    to_resource_id=UUID(candidate_score.resource_id),
                    to_resource_name=candidate_score.resource_name,
                    to_utilization_pct_before=round(before_pct, 1),
                    to_utilization_pct_after=round(after_pct, 1),
                    explanation=candidate_score.explanation,
                )
            )
            # One real, actionable suggestion per overloaded resource per call -- surfacing their
            # entire task list at once would overwhelm the "Auto-Balance" drawer; re-running this
            # after applying one reassignment naturally surfaces the next one if they're still over.
            break

    return suggestions
