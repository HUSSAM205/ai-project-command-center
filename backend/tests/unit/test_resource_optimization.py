"""Unit tests for app/services/resource_optimization.py (explainable weighted ranking:
skill_match*0.5 + availability*0.35 + cost_score*0.15), per docs/PRODUCT_REQUIREMENTS.md
("Resource Optimization"). Pure function, no DB.
"""

from uuid import uuid4

import pytest

from app.models.resource import Resource
from app.services.resource_optimization import rank_candidates


def _resource(**overrides) -> Resource:
    defaults = dict(
        id=uuid4(),
        name="Resource",
        role="Engineer",
        department="Engineering",
        skills=[],
        hourly_cost=100,
        capacity_hours_per_week=40,
    )
    defaults.update(overrides)
    return Resource(**defaults)


class TestHandComputedExample:
    def test_two_candidates_full_breakdown(self):
        """Two candidates for a task requiring {"Python", "Machine Learning"}:

        Candidate A: skills={"Python","Machine Learning","NLP"}, cost=$95/hr, workload=10/40
            skill_match_pct  = 100 * |{"Python","ML"} ∩ A.skills| / 2 = 100 * 2/2 = 100
            availability_pct = 100 * (1 - 10/40) = 75
        Candidate B: skills={"Python"}, cost=$60/hr, workload=36/40
            skill_match_pct  = 100 * 1/2 = 50
            availability_pct = 100 * (1 - 36/40) = 10
        cost pool: min=60, max=95
            A.cost_score = 100 * (95-95)/(95-60) = 0
            B.cost_score = 100 * (95-60)/(95-60) = 100
        overall:
            A = 100*0.5 + 75*0.35 + 0*0.15   = 50 + 26.25 + 0     = 76.25
            B = 50*0.5  + 10*0.35 + 100*0.15  = 25 + 3.5 + 15      = 43.5
        A ranks first (higher overall), and only A crosses the >=70 "recommended" explanation
        threshold.
        """
        required_skills = ["Python", "Machine Learning"]
        candidate_a = _resource(
            name="Sarah Chen", skills=["Python", "Machine Learning", "NLP"], hourly_cost=95
        )
        candidate_b = _resource(name="Bob Jones", skills=["Python"], hourly_cost=60)
        workloads = {candidate_a.id: 10, candidate_b.id: 36}

        ranked = rank_candidates(required_skills, [candidate_a, candidate_b], workloads)

        assert [c.resource_name for c in ranked] == ["Sarah Chen", "Bob Jones"]

        a, b = ranked
        assert a.skill_match_pct == pytest.approx(100.0)
        assert a.availability_pct == pytest.approx(75.0)
        assert a.cost_score == pytest.approx(0.0)
        assert a.overall == pytest.approx(76.25)
        assert "recommended" in a.explanation

        assert b.skill_match_pct == pytest.approx(50.0)
        assert b.availability_pct == pytest.approx(10.0)
        assert b.cost_score == pytest.approx(100.0)
        assert b.overall == pytest.approx(43.5)
        assert "recommended" not in b.explanation


class TestEdgeCases:
    def test_no_required_skills_means_full_skill_match_for_everyone(self):
        r = _resource(skills=["Anything"], hourly_cost=50)
        ranked = rank_candidates([], [r], {r.id: 0})
        assert ranked[0].skill_match_pct == 100.0

    def test_none_required_skills_treated_same_as_empty_list(self):
        r = _resource(skills=None, hourly_cost=50)
        ranked = rank_candidates(None, [r], {r.id: 0})
        assert ranked[0].skill_match_pct == 100.0

    def test_no_matching_skills_scores_zero_percent_match(self):
        r = _resource(skills=["Java"], hourly_cost=50)
        ranked = rank_candidates(["Python", "SQL"], [r], {r.id: 0})
        assert ranked[0].skill_match_pct == 0.0

    def test_equal_cost_pool_gives_everyone_full_cost_score(self):
        r1 = _resource(hourly_cost=80)
        r2 = _resource(hourly_cost=80)
        ranked = rank_candidates([], [r1, r2], {r1.id: 0, r2.id: 0})
        assert all(c.cost_score == 100.0 for c in ranked)

    def test_fully_booked_resource_has_zero_availability_not_negative(self):
        r = _resource(capacity_hours_per_week=40)
        ranked = rank_candidates([], [r], {r.id: 60})  # over capacity
        assert ranked[0].availability_pct == 0.0  # clamped, never negative

    def test_zero_capacity_resource_has_zero_availability_no_division_error(self):
        r = _resource(capacity_hours_per_week=0)
        ranked = rank_candidates([], [r], {r.id: 0})
        assert ranked[0].availability_pct == 0.0

    def test_unknown_resource_id_in_workloads_defaults_to_zero_workload(self):
        r = _resource(capacity_hours_per_week=40)
        ranked = rank_candidates([], [r], {})  # no entry for r.id
        assert ranked[0].availability_pct == 100.0

    def test_empty_candidate_list_returns_empty_list(self):
        assert rank_candidates(["Python"], [], {}) == []

    def test_results_sorted_descending_by_overall_score(self):
        low = _resource(name="Low", skills=[], hourly_cost=100)
        high = _resource(name="High", skills=["Python"], hourly_cost=50)
        ranked = rank_candidates(["Python"], [low, high], {low.id: 40, high.id: 0})
        overalls = [c.overall for c in ranked]
        assert overalls == sorted(overalls, reverse=True)
        assert ranked[0].resource_name == "High"

    def test_explanation_string_contains_all_three_metrics(self):
        r = _resource(name="Priya", skills=["SQL"], hourly_cost=85, capacity_hours_per_week=40)
        ranked = rank_candidates(["SQL"], [r], {r.id: 12})
        explanation = ranked[0].explanation
        assert "skill match" in explanation
        assert "available" in explanation
        assert "$85/hr" in explanation or "$" in explanation
