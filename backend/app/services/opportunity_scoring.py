"""Deterministic AI Opportunity Scoring (Phase 4 — Consulting Workspace, spec §36).

Weighted 6-dimension formula. No AI, no randomness — same transparency discipline as
app/services/health_score.py and app/services/cost_forecast.py: every input is a consultant-
entered 1-5 integer, and the weights below are the single source of truth, never adjusted by
an AI call.

Dimension semantics (all inputs are 1-5 integers):
    business_impact   1 = minimal impact          .. 5 = transformational impact    (higher = better)
    feasibility        1 = very difficult to build  .. 5 = very easy to build        (higher = better)
    data_readiness     1 = data unavailable/poor    .. 5 = clean & readily available (higher = better)
    time_to_value      1 = slow (12+ months)        .. 5 = fast (quick win)          (higher = better)
    cost               1 = very low investment      .. 5 = very high investment      (higher = WORSE)
    risk               1 = very low risk             .. 5 = very high risk            (higher = WORSE)

`cost` and `risk` are inverted (6 - x) before weighting, so every dimension in the weighted
sum points the same direction: "higher contribution = more attractive opportunity".

    overall_score = 20 * (
        0.30 * business_impact +
        0.20 * feasibility +
        0.15 * data_readiness +
        0.15 * (6 - cost) +
        0.10 * time_to_value +
        0.10 * (6 - risk)
    )

Weights sum to 1.00. Each weighted term draws on a 1-5 input, so the weighted sum ranges 1-5;
multiplying by 20 maps that onto a 20-100 scale, deliberately echoing the 0-100 Health Score
scale used elsewhere in this app. Rounded to the nearest integer.
"""

from dataclasses import dataclass

W_BUSINESS_IMPACT = 0.30
W_FEASIBILITY = 0.20
W_DATA_READINESS = 0.15
W_COST = 0.15
W_TIME_TO_VALUE = 0.10
W_RISK = 0.10


@dataclass
class OpportunityScoreResult:
    overall_score: int
    # Each dimension's actual contribution to the weighted sum (pre-multiplication by 20) —
    # exposed to the API/frontend so the score is auditable, not a black box.
    score_breakdown: dict[str, float]


def compute_opportunity_score(
    business_impact: int,
    feasibility: int,
    data_readiness: int,
    cost: int,
    time_to_value: int,
    risk: int,
) -> OpportunityScoreResult:
    inverted_cost = 6 - cost
    inverted_risk = 6 - risk

    score_breakdown = {
        "business_impact": round(business_impact * W_BUSINESS_IMPACT, 3),
        "feasibility": round(feasibility * W_FEASIBILITY, 3),
        "data_readiness": round(data_readiness * W_DATA_READINESS, 3),
        "cost": round(inverted_cost * W_COST, 3),
        "time_to_value": round(time_to_value * W_TIME_TO_VALUE, 3),
        "risk": round(inverted_risk * W_RISK, 3),
    }
    weighted_sum = sum(score_breakdown.values())
    overall_score = int(round(20 * weighted_sum))
    return OpportunityScoreResult(overall_score=overall_score, score_breakdown=score_breakdown)
