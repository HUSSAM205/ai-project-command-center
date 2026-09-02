"""Unit tests for app/services/cost_forecast.py (EVM baseline: EAC = BAC / CPI), per the
formula documented in docs/PRODUCT_REQUIREMENTS.md. Expected values are computed directly
from the same formula the service implements, so these tests exercise the *arithmetic wiring*
(clamping, branch selection, rounding) rather than re-deriving the formula by hand every time —
plus one fully hand-computed literal example.
"""

from datetime import date

import pytest

from app.models.enums import Priority, ProjectStatus
from app.models.project import Project
from app.services.cost_forecast import compute_cost_forecast


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


class TestHandComputedExample:
    def test_ai_customer_intelligence_scenario(self):
        """Reproduces the seeded "AI Customer Intelligence" project (budget=500000,
        actual_cost=330000, progress=68):
            earned_value = 0.68 * 500000            = 340000
            cpi          = 340000 / 330000           = 1.030303...
            forecasted   = 500000 / 1.030303          = 485294.12
            variance     = 485294.12 - 500000         = -14705.88
            variance_pct = -14705.88 / 500000 * 100    = -2.941176%
            since variance < 0:
            overrun_probability = clamp(15 + (-2.941176)*0.5, 0, 20) = clamp(13.5294, 0, 20) = 13.53
        """
        project = _project(budget=500_000, actual_cost=330_000, progress=68)
        result = compute_cost_forecast(project)

        assert result.earned_value == pytest.approx(340_000.0)
        assert result.cpi == pytest.approx(1.0303, abs=0.001)
        assert result.forecasted_final_cost == pytest.approx(485_294.12, abs=0.5)
        assert result.variance == pytest.approx(-14_705.88, abs=0.5)
        assert result.variance_percent == pytest.approx(-2.9412, abs=0.01)
        assert result.overrun_probability == pytest.approx(13.53, abs=0.05)
        assert result.method == "baseline estimate (EVM: EAC = BAC / CPI)"


class TestInsufficientDataBranch:
    def test_zero_progress_uses_budget_as_baseline(self):
        project = _project(budget=200_000, actual_cost=0, progress=0)
        result = compute_cost_forecast(project)
        assert result.forecasted_final_cost == 200_000.0
        assert result.method == "insufficient data — using budget as baseline"
        assert result.cpi is None
        assert result.earned_value is None
        assert result.variance == 0.0

    def test_negative_progress_uses_budget_as_baseline(self):
        project = _project(budget=200_000, actual_cost=50_000, progress=-5)
        result = compute_cost_forecast(project)
        assert result.method == "insufficient data — using budget as baseline"

    def test_zero_actual_cost_uses_budget_as_baseline_even_with_progress(self):
        project = _project(budget=200_000, actual_cost=0, progress=30)
        result = compute_cost_forecast(project)
        assert result.method == "insufficient data — using budget as baseline"
        assert result.forecasted_final_cost == 200_000.0


class TestEVMBranch:
    def test_on_budget_project_has_zero_variance(self):
        # progress% spent == progress% of budget spent exactly -> cpi == 1 -> no variance.
        project = _project(budget=100_000, actual_cost=50_000, progress=50)
        result = compute_cost_forecast(project)
        assert result.cpi == pytest.approx(1.0)
        assert result.forecasted_final_cost == pytest.approx(100_000.0)
        assert result.variance == pytest.approx(0.0)
        # variance == 0 takes the "not > 0" branch: overrun_probability = clamp(15+0,0,20) = 15
        assert result.overrun_probability == pytest.approx(15.0)

    def test_overspending_project_has_positive_variance_and_higher_overrun_probability(self):
        # Spent 80% of budget but only 40% complete -> CPI = 0.5 -> forecasted final cost doubles.
        project = _project(budget=100_000, actual_cost=80_000, progress=40)
        result = compute_cost_forecast(project)
        assert result.cpi == pytest.approx(0.5)
        assert result.forecasted_final_cost == pytest.approx(200_000.0)
        assert result.variance == pytest.approx(100_000.0)
        assert result.variance_percent == pytest.approx(100.0)
        # variance > 0 branch: clamp(5 + 100*1.2, 0, 95) = clamp(125, 0, 95) = 95 (capped)
        assert result.overrun_probability == pytest.approx(95.0)

    def test_underspending_project_has_negative_variance(self):
        # Spent 20% of budget but 40% complete -> CPI = 2.0 -> forecasted final cost halves.
        project = _project(budget=100_000, actual_cost=20_000, progress=40)
        result = compute_cost_forecast(project)
        assert result.cpi == pytest.approx(2.0)
        assert result.forecasted_final_cost == pytest.approx(50_000.0)
        assert result.variance < 0

    def test_zero_budget_does_not_raise_and_variance_percent_is_zero(self):
        project = _project(budget=0, actual_cost=10_000, progress=50)
        result = compute_cost_forecast(project)
        assert result.variance_percent == 0.0

    def test_overrun_probability_is_always_clamped_between_0_and_95(self):
        # Extreme overspend.
        project = _project(budget=10_000, actual_cost=1_000_000, progress=1)
        result = compute_cost_forecast(project)
        assert 0 <= result.overrun_probability <= 95

    def test_method_label_never_claims_to_be_ml(self):
        project = _project(budget=100_000, actual_cost=50_000, progress=50)
        result = compute_cost_forecast(project)
        assert "ML" not in result.method
        assert "baseline" in result.method.lower()
