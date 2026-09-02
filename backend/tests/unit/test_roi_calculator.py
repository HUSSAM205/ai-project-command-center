"""Unit tests for app/services/roi_calculator.py (pure ROI formula, Phase 4 Consulting
Workspace). Formula (see the module docstring):

    efficiency_savings   = current_cost * (expected_efficiency_gain / 100)
    annual_benefit       = annual_savings + efficiency_savings - maintenance_cost
    net_benefit          = annual_benefit - implementation_cost
    roi_percent          = (net_benefit / implementation_cost) * 100   (None if implementation_cost <= 0)
    payback_period_months = implementation_cost / (annual_benefit / 12) (None if annual_benefit <= 0)
"""

import pytest

from app.services.roi_calculator import compute_roi


class TestHandComputedExample:
    def test_typical_automation_business_case(self):
        """current_cost=200000, implementation_cost=50000, expected_efficiency_gain=30%,
        annual_savings=20000, maintenance_cost=10000:
            efficiency_savings = 200000 * 0.30                = 60000
            annual_benefit     = 20000 + 60000 - 10000          = 70000
            net_benefit        = 70000 - 50000                  = 20000
            roi_percent        = (20000 / 50000) * 100          = 40.0
            payback_months     = 50000 / (70000 / 12)           = 8.571428...
        """
        result = compute_roi(
            current_cost=200_000,
            implementation_cost=50_000,
            expected_efficiency_gain=30,
            annual_savings=20_000,
            maintenance_cost=10_000,
        )
        assert result.efficiency_savings == pytest.approx(60_000.0)
        assert result.annual_benefit == pytest.approx(70_000.0)
        assert result.net_benefit == pytest.approx(20_000.0)
        assert result.roi_percent == pytest.approx(40.0)
        assert result.payback_period_months == pytest.approx(8.57, abs=0.01)
        assert "EAC" not in result.formula  # not the cost-forecast formula, sanity check
        assert "roi_percent" in result.formula


class TestUndefinedCases:
    def test_zero_implementation_cost_makes_roi_percent_none(self):
        result = compute_roi(
            current_cost=100_000,
            implementation_cost=0,
            expected_efficiency_gain=10,
            annual_savings=5_000,
            maintenance_cost=1_000,
        )
        assert result.roi_percent is None

    def test_negative_implementation_cost_also_makes_roi_percent_none(self):
        result = compute_roi(
            current_cost=100_000,
            implementation_cost=-100,
            expected_efficiency_gain=10,
            annual_savings=5_000,
            maintenance_cost=1_000,
        )
        assert result.roi_percent is None

    def test_zero_or_negative_annual_benefit_makes_payback_none_never_pays_back(self):
        # maintenance eats all the benefit -> annual_benefit <= 0 -> undefined payback.
        result = compute_roi(
            current_cost=10_000,
            implementation_cost=50_000,
            expected_efficiency_gain=0,
            annual_savings=0,
            maintenance_cost=5_000,
        )
        assert result.annual_benefit < 0
        assert result.payback_period_months is None
        # roi_percent is still defined (implementation_cost > 0) even though payback isn't.
        assert result.roi_percent is not None

    def test_payback_none_when_implementation_cost_zero_even_if_benefit_positive(self):
        result = compute_roi(
            current_cost=10_000,
            implementation_cost=0,
            expected_efficiency_gain=50,
            annual_savings=1_000,
            maintenance_cost=0,
        )
        assert result.payback_period_months is None


class TestArithmeticWiring:
    def test_negative_roi_when_net_benefit_negative(self):
        result = compute_roi(
            current_cost=1_000,
            implementation_cost=50_000,
            expected_efficiency_gain=10,
            annual_savings=0,
            maintenance_cost=0,
        )
        assert result.net_benefit < 0
        assert result.roi_percent < 0

    def test_zero_efficiency_gain_contributes_zero_savings(self):
        result = compute_roi(
            current_cost=1_000_000,
            implementation_cost=10_000,
            expected_efficiency_gain=0,
            annual_savings=5_000,
            maintenance_cost=0,
        )
        assert result.efficiency_savings == 0.0
        assert result.annual_benefit == 5_000.0

    def test_values_are_rounded_to_two_decimal_places(self):
        result = compute_roi(
            current_cost=333.33,
            implementation_cost=111.11,
            expected_efficiency_gain=33.333,
            annual_savings=77.77,
            maintenance_cost=1.11,
        )
        for value in (result.efficiency_savings, result.annual_benefit, result.net_benefit):
            assert round(value, 2) == value
