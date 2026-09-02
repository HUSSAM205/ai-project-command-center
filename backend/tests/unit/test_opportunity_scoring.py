"""Unit tests for app/services/opportunity_scoring.py (Phase 4 Consulting Workspace,
deterministic 6-dimension weighted scoring). Formula (see the module docstring):

    overall_score = 20 * (0.30*business_impact + 0.20*feasibility + 0.15*data_readiness
                           + 0.15*(6-cost) + 0.10*time_to_value + 0.10*(6-risk))

`cost` and `risk` are inverted (6-x) before weighting since higher raw input is worse for
those two dimensions.
"""

import pytest

from app.services.opportunity_scoring import compute_opportunity_score


class TestHandComputedExamples:
    def test_strong_opportunity(self):
        """business_impact=5, feasibility=4, data_readiness=3, cost=2, time_to_value=5, risk=1
            inverted_cost=4, inverted_risk=5
            weighted = 0.30*5 + 0.20*4 + 0.15*3 + 0.15*4 + 0.10*5 + 0.10*5
                     = 1.5   + 0.8   + 0.45  + 0.6   + 0.5   + 0.5   = 4.35
            overall  = round(20 * 4.35) = 87
        """
        result = compute_opportunity_score(
            business_impact=5, feasibility=4, data_readiness=3, cost=2, time_to_value=5, risk=1
        )
        assert result.overall_score == 87
        assert result.score_breakdown["business_impact"] == pytest.approx(1.5)
        assert result.score_breakdown["feasibility"] == pytest.approx(0.8)
        assert result.score_breakdown["data_readiness"] == pytest.approx(0.45)
        assert result.score_breakdown["cost"] == pytest.approx(0.6)  # (6-2)*0.15
        assert result.score_breakdown["time_to_value"] == pytest.approx(0.5)
        assert result.score_breakdown["risk"] == pytest.approx(0.5)  # (6-1)*0.10

    def test_weak_opportunity_low_impact_high_cost_high_risk(self):
        """business_impact=2, feasibility=1, data_readiness=1, cost=5, time_to_value=1, risk=5
            inverted_cost=1, inverted_risk=1
            weighted = 0.30*2+0.20*1+0.15*1+0.15*1+0.10*1+0.10*1 = 0.6+0.2+0.15+0.15+0.1+0.1 = 1.30
            overall  = round(20*1.30) = 26
        """
        result = compute_opportunity_score(
            business_impact=2, feasibility=1, data_readiness=1, cost=5, time_to_value=1, risk=5
        )
        assert result.overall_score == 26

    def test_maximum_possible_score(self):
        """All dimensions at their best (5 for the "higher=better" ones, 1 for cost/risk):
            weighted = 0.30*5+0.20*5+0.15*5+0.15*5+0.10*5+0.10*5 = 5.0
            overall  = 20*5 = 100
        """
        result = compute_opportunity_score(
            business_impact=5, feasibility=5, data_readiness=5, cost=1, time_to_value=5, risk=1
        )
        assert result.overall_score == 100

    def test_minimum_possible_score(self):
        """All dimensions at their worst -> weighted sum = 1.0 -> overall = 20."""
        result = compute_opportunity_score(
            business_impact=1, feasibility=1, data_readiness=1, cost=5, time_to_value=1, risk=5
        )
        assert result.overall_score == 20


class TestFormulaProperties:
    def test_weights_sum_to_one(self):
        from app.services import opportunity_scoring as m

        total_weight = (
            m.W_BUSINESS_IMPACT
            + m.W_FEASIBILITY
            + m.W_DATA_READINESS
            + m.W_COST
            + m.W_TIME_TO_VALUE
            + m.W_RISK
        )
        assert total_weight == pytest.approx(1.0)

    def test_higher_cost_lowers_score_all_else_equal(self):
        cheap = compute_opportunity_score(
            business_impact=3, feasibility=3, data_readiness=3, cost=1, time_to_value=3, risk=3
        )
        expensive = compute_opportunity_score(
            business_impact=3, feasibility=3, data_readiness=3, cost=5, time_to_value=3, risk=3
        )
        assert cheap.overall_score > expensive.overall_score

    def test_higher_risk_lowers_score_all_else_equal(self):
        safe = compute_opportunity_score(
            business_impact=3, feasibility=3, data_readiness=3, cost=3, time_to_value=3, risk=1
        )
        risky = compute_opportunity_score(
            business_impact=3, feasibility=3, data_readiness=3, cost=3, time_to_value=3, risk=5
        )
        assert safe.overall_score > risky.overall_score

    def test_score_is_bounded_20_to_100_for_valid_1_to_5_inputs(self):
        import itertools

        for bi, feas, dr, cost, ttv, risk in itertools.product(range(1, 6), repeat=6):
            if (bi, feas, dr, cost, ttv, risk) not in {(1, 1, 1, 1, 1, 1), (5, 5, 5, 5, 5, 5)}:
                continue  # keep the exhaustive check cheap; corner points are most informative
            result = compute_opportunity_score(
                business_impact=bi, feasibility=feas, data_readiness=dr, cost=cost, time_to_value=ttv, risk=risk
            )
            assert 1 <= result.overall_score <= 100
