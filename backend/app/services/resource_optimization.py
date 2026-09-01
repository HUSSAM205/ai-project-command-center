"""Deterministic Resource Optimization — explainable weighted ranking.

No AI, no randomness. Ranks candidate resources for a task by skill match / availability / cost.
Formula reference: docs/PRODUCT_REQUIREMENTS.md ("Resource Optimization").
"""

from dataclasses import dataclass

from app.models.resource import Resource
from app.services.common import clamp


@dataclass
class CandidateScore:
    resource_id: str
    resource_name: str
    skill_match_pct: float
    availability_pct: float
    cost_score: float
    overall: float
    explanation: str


def _explanation(skill_match_pct: float, availability_pct: float, hourly_cost: float, overall: float) -> str:
    verdict = " — recommended" if overall >= 70 else ""
    return f"{skill_match_pct:.0f}% skill match, {availability_pct:.0f}% available, ${hourly_cost:.0f}/hr{verdict}"


def rank_candidates(
    required_skills: list[str] | None,
    candidates: list[Resource],
    workloads: dict,
) -> list[CandidateScore]:
    """`workloads` maps resource.id -> current_workload_hours_per_week (already computed)."""
    if not candidates:
        return []

    required = set(required_skills or [])
    costs = [float(c.hourly_cost or 0) for c in candidates]
    min_cost, max_cost = min(costs), max(costs)

    results: list[CandidateScore] = []
    for resource in candidates:
        resource_skills = set(resource.skills or [])
        if not required:
            skill_match_pct = 100.0
        else:
            matched = required.intersection(resource_skills)
            skill_match_pct = 100.0 * len(matched) / len(required)

        capacity = float(resource.capacity_hours_per_week or 0)
        workload = float(workloads.get(resource.id, 0))
        if capacity > 0:
            availability_pct = clamp(100.0 * (1 - workload / capacity), 0, 100)
        else:
            availability_pct = 0.0

        hourly_cost = float(resource.hourly_cost or 0)
        if max_cost == min_cost:
            cost_score = 100.0
        else:
            cost_score = 100.0 * (max_cost - hourly_cost) / (max_cost - min_cost)

        overall = skill_match_pct * 0.5 + availability_pct * 0.35 + cost_score * 0.15

        results.append(
            CandidateScore(
                resource_id=str(resource.id),
                resource_name=resource.name,
                skill_match_pct=round(skill_match_pct, 2),
                availability_pct=round(availability_pct, 2),
                cost_score=round(cost_score, 2),
                overall=round(overall, 2),
                explanation=_explanation(skill_match_pct, availability_pct, hourly_cost, overall),
            )
        )

    results.sort(key=lambda c: c.overall, reverse=True)
    return results
