"""Real Critical Path Method (CPM) over a project's actual task_dependencies graph, plus honest
bottleneck flagging: a critical-path task currently behind schedule, its real transitive downstream
impact, and a suggested mitigation reusing app/services/resource_optimization.py's existing
explainable candidate-ranking (never a fabricated "AI suggestion" -- the same real formula the
Resources page's "Suggest Assignees" card already uses).

CPM lives here as a genuine backend engine -- distinct from the frontend's own topoOrder/Monte
Carlo simulator (frontend/app/app/projects/[id]/page.tsx), which does dependency-aware scheduling
for its own probabilistic forecast but has never computed or exposed early/late start/finish or
float. See docs/ENTERPRISE_ARCHITECTURE_SPEC.md §2.2, which flagged this as a real, undone gap.
"""

from dataclasses import dataclass, field
from datetime import date, timedelta
from uuid import UUID

from app.models.enums import TaskStatus
from app.models.resource import Resource
from app.models.task import Task, TaskDependency
from app.services.resource_optimization import CandidateScore, rank_candidates

HOURS_PER_DAY = 8.0  # same convention frontend's Monte Carlo simulator uses (MC_HOURS_PER_DAY)
DEFAULT_TASK_DURATION_DAYS = 1.0


def _task_duration_days(task: Task) -> float:
    if task.start_date and task.due_date and task.due_date > task.start_date:
        return float((task.due_date - task.start_date).days)
    if task.estimated_hours:
        return max(0.5, float(task.estimated_hours) / HOURS_PER_DAY)
    return DEFAULT_TASK_DURATION_DAYS


@dataclass
class CriticalPathTask:
    task_id: UUID
    early_start: float
    early_finish: float
    late_start: float
    late_finish: float
    float_days: float
    is_critical: bool


def compute_critical_path(tasks: list[Task], dependencies: list[TaskDependency]) -> dict[UUID, CriticalPathTask]:
    """Standard forward/backward-pass CPM in relative day-offsets (0 = the earliest task with no
    predecessors). TaskDependency.depends_on_task_id is a PREREQUISITE of .task_id (see
    app/models/task.py). A dependency cycle -- not expected in real data, but not assumed
    impossible either -- simply leaves the involved tasks out of the topological order and
    therefore out of the result, rather than raising."""
    tasks_by_id = {t.id: t for t in tasks}
    duration = {t.id: _task_duration_days(t) for t in tasks}

    predecessors: dict[UUID, list[UUID]] = {t.id: [] for t in tasks}
    successors: dict[UUID, list[UUID]] = {t.id: [] for t in tasks}
    for dep in dependencies:
        if dep.task_id in tasks_by_id and dep.depends_on_task_id in tasks_by_id:
            predecessors[dep.task_id].append(dep.depends_on_task_id)
            successors[dep.depends_on_task_id].append(dep.task_id)

    remaining_in_degree = {tid: len(preds) for tid, preds in predecessors.items()}
    order: list[UUID] = []
    frontier = [tid for tid, deg in remaining_in_degree.items() if deg == 0]
    while frontier:
        next_frontier: list[UUID] = []
        for tid in frontier:
            order.append(tid)
            for succ in successors[tid]:
                remaining_in_degree[succ] -= 1
                if remaining_in_degree[succ] == 0:
                    next_frontier.append(succ)
        frontier = next_frontier

    early_start: dict[UUID, float] = {}
    early_finish: dict[UUID, float] = {}
    for tid in order:
        es = max((early_finish[p] for p in predecessors[tid] if p in early_finish), default=0.0)
        early_start[tid] = es
        early_finish[tid] = es + duration[tid]

    project_finish = max(early_finish.values(), default=0.0)

    late_finish: dict[UUID, float] = {}
    late_start: dict[UUID, float] = {}
    for tid in reversed(order):
        lf = min((late_start[s] for s in successors[tid] if s in late_start), default=project_finish)
        late_finish[tid] = lf
        late_start[tid] = lf - duration[tid]

    result: dict[UUID, CriticalPathTask] = {}
    for tid in order:
        f = late_start[tid] - early_start[tid]
        result[tid] = CriticalPathTask(
            task_id=tid,
            early_start=round(early_start[tid], 2),
            early_finish=round(early_finish[tid], 2),
            late_start=round(late_start[tid], 2),
            late_finish=round(late_finish[tid], 2),
            float_days=round(f, 2),
            is_critical=f <= 0.01,
        )
    return result


@dataclass
class Bottleneck:
    task_id: UUID
    task_title: str
    root_cause: str
    slippage_days: int
    downstream_task_ids: list[UUID]
    downstream_task_titles: list[str]
    suggested_action: str
    suggested_candidate: CandidateScore | None = field(default=None)


def _downstream_tasks(task_id: UUID, successors: dict[UUID, list[UUID]]) -> list[UUID]:
    """Every task transitively blocked by `task_id`, in BFS order, deduplicated."""
    seen: set[UUID] = set()
    queue = list(successors.get(task_id, []))
    ordered: list[UUID] = []
    while queue:
        nxt = queue.pop(0)
        if nxt in seen:
            continue
        seen.add(nxt)
        ordered.append(nxt)
        queue.extend(successors.get(nxt, []))
    return ordered


def detect_bottlenecks(
    tasks: list[Task],
    dependencies: list[TaskDependency],
    resources: list[Resource],
    resource_workloads: dict[UUID, float],
    today: date | None = None,
) -> list[Bottleneck]:
    """A bottleneck is a critical-path task that is genuinely behind: either explicitly BLOCKED,
    or its due date has already passed while it isn't DONE. Tasks not on the critical path are
    never flagged here even if they're individually late -- by CPM definition they have float and
    aren't what's actually threatening the project finish date."""
    today = today or date.today()
    tasks_by_id = {t.id: t for t in tasks}
    cpm = compute_critical_path(tasks, dependencies)

    successors: dict[UUID, list[UUID]] = {t.id: [] for t in tasks}
    for dep in dependencies:
        if dep.task_id in tasks_by_id and dep.depends_on_task_id in tasks_by_id:
            successors[dep.depends_on_task_id].append(dep.task_id)

    resources_by_id = {r.id: r for r in resources}

    bottlenecks: list[Bottleneck] = []
    for task in tasks:
        cp = cpm.get(task.id)
        if cp is None or not cp.is_critical or task.status == TaskStatus.DONE:
            continue

        is_blocked = task.status == TaskStatus.BLOCKED
        is_overdue = task.due_date is not None and task.due_date < today
        if not is_blocked and not is_overdue:
            continue

        if is_overdue:
            slippage_days = (today - task.due_date).days
            root_cause = (
                f'"{task.title}" is {slippage_days} day(s) past its {task.due_date.isoformat()} due date '
                f"and sits on the critical path -- every day of further delay here delays the whole project."
            )
        else:
            slippage_days = 0
            root_cause = (
                f'"{task.title}" is marked BLOCKED and sits on the critical path -- it has not yet '
                f"missed its due date, but nothing downstream can start until it clears."
            )

        downstream_ids = _downstream_tasks(task.id, successors)
        downstream_titles = [tasks_by_id[tid].title for tid in downstream_ids if tid in tasks_by_id]

        candidate: CandidateScore | None = None
        suggested_action = "No well-matched alternative resource found — escalate scope or timeline directly."
        if resources:
            ranked = rank_candidates(task.required_skills, resources, resource_workloads)
            # Never suggest reassigning a task to the person already holding it.
            ranked = [c for c in ranked if c.resource_id != str(task.assignee_id)] if task.assignee_id else ranked
            # rank_candidates weights availability/cost alongside skill match (by design, for its
            # original use -- a ranked list a human reviews on the Resources page). Surfaced here
            # as a single headline "the fix", that same formula can hand back someone with zero
            # real overlap with the task's required_skills just for being cheap/available -- a
            # correct score, a bad recommendation to lead with. Only surface a candidate here when
            # the task has no stated required_skills (100% match is meaningful) or the top
            # candidate actually has some real skill overlap.
            qualified = [c for c in ranked if not task.required_skills or c.skill_match_pct > 0]
            if qualified:
                candidate = qualified[0]
                current = resources_by_id.get(task.assignee_id) if task.assignee_id else None
                verb = "Reassign" if current is not None else "Assign"
                suggested_action = (
                    f"{verb} to {candidate.resource_name} ({candidate.explanation}) to unblock the critical path."
                )

        bottlenecks.append(
            Bottleneck(
                task_id=task.id,
                task_title=task.title,
                root_cause=root_cause,
                slippage_days=slippage_days,
                downstream_task_ids=downstream_ids,
                downstream_task_titles=downstream_titles,
                suggested_action=suggested_action,
                suggested_candidate=candidate,
            )
        )

    bottlenecks.sort(key=lambda b: (b.slippage_days, len(b.downstream_task_ids)), reverse=True)
    return bottlenecks
