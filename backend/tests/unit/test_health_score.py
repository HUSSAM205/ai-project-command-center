"""Unit tests for app/services/health_score.py against the formula documented in
docs/PRODUCT_REQUIREMENTS.md ("Health Score"). No DB, no HTTP — pure function tests against
in-memory (unpersisted) ORM objects, with expected values hand-computed from the formula.
"""

from datetime import date

import pytest

from app.models.enums import Priority, ProjectStatus, RiskCategory, RiskStatus, TaskStatus
from app.models.project import Project
from app.models.risk import Risk
from app.models.task import Task
from app.services.common import clamp
from app.services.health_score import compute_health_score, derive_risk_level


def _project(**overrides) -> Project:
    defaults = dict(
        name="Test Project",
        status=ProjectStatus.ACTIVE,
        priority=Priority.HIGH,
        start_date=date(2026, 1, 1),
        end_date=date(2026, 12, 31),
        budget=100_000,
        actual_cost=0,
        progress=0,
    )
    defaults.update(overrides)
    return Project(**defaults)


def _task(**overrides) -> Task:
    defaults = dict(title="Task", status=TaskStatus.TODO, priority=Priority.MEDIUM, completion_percentage=0)
    defaults.update(overrides)
    return Task(**defaults)


def _risk(**overrides) -> Risk:
    defaults = dict(
        title="Risk",
        category=RiskCategory.TECHNICAL,
        probability=3,
        impact=3,
        status=RiskStatus.OPEN,
    )
    defaults.update(overrides)
    return Risk(**defaults)


class TestDocumentedExample:
    """Reproduces the "Digital Transformation Program" scenario from app/seed.py (seeded with
    real schedule slippage, overspend, blocked tasks, high-severity risks and overloaded
    resources on purpose, so it lands at a low, genuinely-computed health score — not a
    coincidence, per the seed script's own docstring). Hand-computed against the exact formula
    in docs/PRODUCT_REQUIREMENTS.md:

    start=2026-01-15, end=2026-11-15 -> total_days=304
    today=2026-09-01 -> elapsed_days=229 -> planned_pct = 100*229/304 = 75.33%
    progress=38  -> schedule_penalty = clamp((75.33-38)*0.6, 0, 30)      = 22.40
    budget=800000, actual_cost=700000
        expected_spend_pct=0.7533, actual_spend_pct=0.875
        -> budget_penalty = clamp((0.875-0.7533)*40, 0, 25)              = 4.87
    8 tasks, completion% = [100,100,100,30,20,10,25,0] -> avg = 48.125
        -> task_penalty = clamp((75.33-48.125)*0.3, 0, 15)               = 8.16
    top3 OPEN/MITIGATING risk scores = [20, 16, 12] (sum 48)
        -> risk_penalty = clamp(48*0.5, 0, 20)                           = 20.00 (clamped)
    2 distinct overloaded resources on this project
        -> resource_penalty = clamp(2*4, 0, 12)                         = 8.00
    3 BLOCKED tasks
        -> dependency_penalty = clamp(3*3, 0, 12)                       = 9.00
    total_penalty = 22.40+4.87+8.16+20.00+8.00+9.00                     = 72.43
    health_score = round(clamp(100-72.43, 0, 100))                      = 28
    """

    def test_health_score_matches_hand_computation(self):
        project = _project(
            start_date=date(2026, 1, 15),
            end_date=date(2026, 11, 15),
            budget=800_000,
            actual_cost=700_000,
            progress=38,
            status=ProjectStatus.AT_RISK,
            priority=Priority.CRITICAL,
        )
        tasks = [
            _task(completion_percentage=100, status=TaskStatus.DONE),
            _task(completion_percentage=100, status=TaskStatus.DONE),
            _task(completion_percentage=100, status=TaskStatus.DONE),
            _task(completion_percentage=30, status=TaskStatus.BLOCKED),
            _task(completion_percentage=20, status=TaskStatus.BLOCKED),
            _task(completion_percentage=10, status=TaskStatus.BLOCKED),
            _task(completion_percentage=25, status=TaskStatus.IN_PROGRESS),
            _task(completion_percentage=0, status=TaskStatus.TODO),
        ]
        risks = [
            _risk(probability=5, impact=4, status=RiskStatus.OPEN),  # score 20
            _risk(probability=4, impact=4, status=RiskStatus.OPEN),  # score 16
            _risk(probability=4, impact=3, status=RiskStatus.OPEN),  # score 12
            _risk(probability=3, impact=3, status=RiskStatus.MITIGATING),  # score 9 (4th -> excluded from top3)
        ]

        result = compute_health_score(
            project, tasks, risks, overloaded_resource_count=2, today=date(2026, 9, 1)
        )

        assert result.planned_pct == pytest.approx(75.33, abs=0.01)
        assert result.avg_task_completion == pytest.approx(48.125, abs=0.01)
        assert result.breakdown["schedule_penalty"] == pytest.approx(22.40, abs=0.05)
        assert result.breakdown["budget_penalty"] == pytest.approx(4.87, abs=0.05)
        assert result.breakdown["task_penalty"] == pytest.approx(8.16, abs=0.05)
        assert result.breakdown["risk_penalty"] == pytest.approx(20.0, abs=0.01)  # clamped at 20
        assert result.breakdown["resource_penalty"] == pytest.approx(8.0, abs=0.01)
        assert result.breakdown["dependency_penalty"] == pytest.approx(9.0, abs=0.01)
        assert result.breakdown["total_penalty"] == pytest.approx(72.43, abs=0.1)
        # This is the documented 27-28/100 example: the project's computed health score is low
        # enough on its own that AT_RISK status (and CRITICAL/HIGH risk_level) is warranted.
        assert result.health_score in (27, 28)
        assert result.risk_level.value == "CRITICAL"


class TestPenaltyClamping:
    def test_schedule_penalty_never_exceeds_30_even_with_extreme_slippage(self):
        # planned 100%, progress 0% -> raw penalty would be 100*0.6=60, clamped to 30.
        project = _project(
            start_date=date(2026, 1, 1), end_date=date(2026, 2, 1), progress=0, budget=0, actual_cost=0
        )
        result = compute_health_score(project, [], [], 0, today=date(2026, 3, 1))
        assert result.breakdown["schedule_penalty"] == 30.0

    def test_budget_penalty_never_exceeds_25(self):
        # Massive overspend relative to plan.
        project = _project(
            start_date=date(2026, 1, 1),
            end_date=date(2026, 12, 31),
            progress=100,
            budget=10_000,
            actual_cost=1_000_000,
        )
        result = compute_health_score(project, [], [], 0, today=date(2026, 1, 2))
        assert result.breakdown["budget_penalty"] == 25.0

    def test_risk_penalty_never_exceeds_20(self):
        project = _project(progress=100, budget=100, actual_cost=100)
        risks = [_risk(probability=5, impact=5, status=RiskStatus.OPEN) for _ in range(5)]  # score 25 each
        result = compute_health_score(project, [], risks, 0, today=date(2026, 1, 1))
        assert result.breakdown["risk_penalty"] == 20.0

    def test_resource_penalty_never_exceeds_12(self):
        project = _project(progress=100, budget=100, actual_cost=100)
        result = compute_health_score(project, [], [], overloaded_resource_count=10, today=date(2026, 1, 1))
        assert result.breakdown["resource_penalty"] == 12.0

    def test_dependency_penalty_never_exceeds_12(self):
        project = _project(progress=100, budget=100, actual_cost=100)
        tasks = [_task(status=TaskStatus.BLOCKED) for _ in range(10)]
        result = compute_health_score(project, tasks, [], 0, today=date(2026, 1, 1))
        assert result.breakdown["dependency_penalty"] == 12.0

    def test_health_score_never_goes_below_zero(self):
        project = _project(
            start_date=date(2026, 1, 1),
            end_date=date(2026, 2, 1),
            progress=0,
            budget=100,
            actual_cost=100_000,
        )
        tasks = [_task(status=TaskStatus.BLOCKED) for _ in range(20)]
        risks = [_risk(probability=5, impact=5, status=RiskStatus.OPEN) for _ in range(5)]
        result = compute_health_score(project, tasks, risks, overloaded_resource_count=20, today=date(2026, 3, 1))
        assert result.health_score == 0
        assert result.risk_level.value == "CRITICAL"


class TestFallbacksAndEdgeCases:
    def test_no_tasks_falls_back_to_project_progress_for_avg_completion(self):
        project = _project(progress=42, budget=0, actual_cost=0)
        result = compute_health_score(project, [], [], 0, today=date(2026, 6, 1))
        assert result.avg_task_completion == 42.0

    def test_zero_budget_means_zero_actual_spend_pct_not_a_division_error(self):
        project = _project(budget=0, actual_cost=0, progress=50)
        result = compute_health_score(project, [], [], 0, today=date(2026, 6, 1))
        # actual_spend_pct is defined as 0 when budget <= 0 (per the formula), never raises.
        assert result.breakdown["budget_penalty"] >= 0

    def test_perfect_on_track_project_scores_100(self):
        # progress exactly matches elapsed time, no overspend, no risks, no blocked tasks.
        project = _project(
            start_date=date(2026, 1, 1), end_date=date(2026, 1, 11), progress=50, budget=1000, actual_cost=500
        )
        result = compute_health_score(project, [], [], 0, today=date(2026, 1, 6))
        assert result.health_score == 100
        assert result.risk_level.value == "LOW"

    def test_only_open_and_mitigating_risks_count_toward_risk_penalty(self):
        project = _project(progress=100, budget=100, actual_cost=100)
        risks = [_risk(probability=5, impact=5, status=RiskStatus.CLOSED)]
        result = compute_health_score(project, [], risks, 0, today=date(2026, 1, 1))
        assert result.breakdown["risk_penalty"] == 0.0

    def test_only_top_three_risk_scores_are_used(self):
        project = _project(progress=100, budget=100, actual_cost=100)
        # 4 open risks with scores 1,1,1,25 — only top 3 by score count, but crucially even a
        # 5th/6th small risk must never sneak into the sum.
        risks = [
            _risk(probability=5, impact=5, status=RiskStatus.OPEN),  # 25
            _risk(probability=1, impact=1, status=RiskStatus.OPEN),  # 1
            _risk(probability=1, impact=1, status=RiskStatus.OPEN),  # 1
            _risk(probability=1, impact=1, status=RiskStatus.OPEN),  # 1
        ]
        result = compute_health_score(project, [], risks, 0, today=date(2026, 1, 1))
        # top3 = 25+1+1 = 27 -> penalty clamp(27*0.5,0,20) = 13.5, NOT clamp((25+1+1+1)*0.5,...)
        assert result.breakdown["risk_penalty"] == pytest.approx(13.5)


@pytest.mark.parametrize(
    "score,expected",
    [
        (100, "LOW"),
        (80, "LOW"),
        (79, "MEDIUM"),
        (60, "MEDIUM"),
        (59, "HIGH"),
        (40, "HIGH"),
        (39, "CRITICAL"),
        (0, "CRITICAL"),
    ],
)
def test_derive_risk_level_thresholds(score, expected):
    assert derive_risk_level(score).value == expected


def test_clamp_helper():
    assert clamp(5, 0, 10) == 5
    assert clamp(-5, 0, 10) == 0
    assert clamp(15, 0, 10) == 10
