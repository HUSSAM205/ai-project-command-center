import type { DashboardSummary, Project } from "./types";
import { formatCompactCurrency, titleCase } from "./utils";

export interface LocalExecutiveBrief {
  summary: string;
  detail: string;
}

/**
 * Deterministic, locally-computed portfolio summary — same spirit as the backend's
 * DemoAIProvider.generate_report (app/ai/providers/demo.py), reimplemented client-side over data
 * the dashboard has *already fetched* (GET /api/v1/dashboard + GET /api/v1/projects). Every number
 * here is a real field already in hand; nothing is invented.
 *
 * This exists purely as an honestly-labeled fallback for when the real, AI-touching
 * GET /api/v1/ai/executive-brief call is slow or unavailable — see the Executive Brief card in
 * app/app/dashboard/page.tsx. It is never presented as an AI response (no `demo_ai`/`gemini`/
 * `groq`/`cache` source is attached to it) — the UI must label it distinctly.
 */
export function buildLocalExecutiveBrief(dashboard: DashboardSummary, projects: Project[]): LocalExecutiveBrief {
  const openRisks = Object.values(dashboard.risk_counts ?? {}).reduce((sum, v) => sum + (v ?? 0), 0);
  const criticalRisks = dashboard.risk_counts?.CRITICAL ?? 0;

  const lines = [
    `Portfolio status: ${dashboard.total_projects} project${dashboard.total_projects === 1 ? "" : "s"} ` +
      `(${dashboard.active_projects} active, ${dashboard.at_risk_projects} at risk, ${dashboard.completed_projects} completed). ` +
      `Average health score ${Math.round(dashboard.avg_health_score)}/100.`,
    `Budget: ${formatCompactCurrency(dashboard.total_actual_cost)} spent of ${formatCompactCurrency(dashboard.total_budget)} ` +
      `(${Math.round(dashboard.budget_utilization_pct)}% utilization).`,
    `Resources: ${Math.round(dashboard.resource_utilization_pct)}% portfolio utilization.`,
    `Risk: ${openRisks} open risk${openRisks === 1 ? "" : "s"} tracked, ${criticalRisks} at CRITICAL severity.`,
  ];

  // Real per-project data, when it has arrived (projects loads independently of the dashboard
  // summary) — lets the fallback name an actual top-concern project, exactly like the backend's
  // "lowest health score" logic, rather than only speaking in portfolio-wide aggregates.
  const lowest = projects.length > 0 ? [...projects].sort((a, b) => a.health_score - b.health_score)[0] : null;

  if (lowest) {
    lines.push(
      `Top concern: ${lowest.name} (${titleCase(lowest.status)}) — health score ${Math.round(lowest.health_score)}/100, ${lowest.risk_level} risk.`,
    );
  }

  const action = lowest
    ? `Focus attention on ${lowest.name} first.`
    : dashboard.at_risk_projects > 0
      ? `${dashboard.at_risk_projects} project${dashboard.at_risk_projects === 1 ? " is" : "s are"} flagged at risk — review the portfolio health list.`
      : "Portfolio is stable — maintain current cadence.";
  lines.push(`Recommended action: ${action}`);

  const summary =
    `${dashboard.total_projects} project${dashboard.total_projects === 1 ? "" : "s"}, avg health ${Math.round(dashboard.avg_health_score)}/100. ` +
    (lowest ? `Top concern: ${lowest.name} (${Math.round(lowest.health_score)}/100).` : "No project currently at risk.");

  return { summary, detail: lines.join("\n") };
}
