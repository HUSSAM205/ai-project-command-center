import type {
  BusinessCase,
  ContractLedger,
  CostForecast,
  EVM,
  Priority,
  Project,
  ProjectStatus,
  RaciEntry,
  Resource,
  Risk,
  RiskLevel,
  StageGate,
  Task,
} from "./types";
import { computeRagStatus } from "./ragStatus";

/**
 * Honest, clearly-labeled fallback data for the PMO and Consulting workspaces.
 *
 * Both pages fan out several backend calls per project (EVM, stage gates, RACI, contract
 * ledger — see app/app/workspace/pmo/page.tsx) or fetch a business-case list. GET requests
 * already retry through Render free-tier cold starts (lib/api.ts / lib/api-pmo.ts's
 * GATEWAY_RETRY logic — see docs/DEPLOYMENT_HANDOVER.md), so this fallback is a last resort:
 * it only engages once that retry path has been exhausted or a request genuinely hangs past
 * OVERALL_TIMEOUT_MS. When it does, the calling page must show a visible "offline preview"
 * label — this data is never presented as live, matching the same discipline
 * lib/localExecutiveBrief.ts uses for the dashboard's executive brief fallback. Every entity
 * below is fictional, never a real company name.
 */

export const OVERALL_TIMEOUT_MS = 9000;

export class TimeoutError extends Error {}

/** Races `promise` against a timer; rejects with TimeoutError if the timer wins. Does not cancel
 * the underlying request — it keeps running, but the caller stops waiting on it. */
export function withTimeout<T>(promise: Promise<T>, ms: number = OVERALL_TIMEOUT_MS): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(`Timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

const now = new Date().toISOString();

function fallbackProject(overrides: Partial<Project> & Pick<Project, "id" | "name">): Project {
  const base = {
    organization_id: "offline-preview",
    description: null,
    client: null,
    manager_id: null,
    manager_name: "—",
    status: "ACTIVE" as ProjectStatus,
    priority: "HIGH" as Priority,
    start_date: now,
    end_date: now,
    budget: 0,
    actual_cost: 0,
    progress: 0,
    health_score: 0,
    risk_level: "MEDIUM" as RiskLevel,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
  return {
    ...base,
    rag_status: overrides.rag_status ?? computeRagStatus(base.status, base.health_score, base.risk_level),
  };
}

function fallbackEvm(projectId: string, overrides: Partial<EVM>): EVM {
  return {
    project_id: projectId,
    bac: 0,
    pv: 0,
    ev: 0,
    ac: 0,
    cpi: null,
    spi: null,
    eac: 0,
    vac: 0,
    planned_pct: 0,
    progress: 0,
    method: "offline-preview",
    anomalies: [],
    ...overrides,
  };
}

function fallbackLedger(projectId: string, overrides: Partial<ContractLedger>): ContractLedger {
  return {
    project_id: projectId,
    total_contract_value: 0,
    billed_to_date: 0,
    wip: 0,
    currency: "USD",
    earned_value: 0,
    cost_variance: 0,
    margin_leakage_pct: 0,
    expected_billing_at_progress: 0,
    billing_gap: 0,
    scope_creep_flag: false,
    planned_margin_pct: 0,
    current_margin_pct: 0,
    ...overrides,
  };
}

export interface OfflinePmoRow {
  project: Project;
  evm: EVM | null;
  gates: StageGate[];
  raci: RaciEntry[];
  ledger: ContractLedger | null;
}

/** Three fictional projects with internally-consistent EVM/ledger figures (CPI/SPI/VAC all
 * derived from the same bac/pv/ev/ac the way app/services/evm.py computes them, not typed in
 * independently) so the portfolio rollup math above them stays coherent. */
export function buildOfflinePmoPortfolio(): OfflinePmoRow[] {
  const rows: OfflinePmoRow[] = [
    {
      project: fallbackProject({
        id: "offline-cloud-migration",
        name: "Cloud Migration Initiative",
        status: "ACTIVE",
        health_score: 78,
        risk_level: "MEDIUM",
        budget: 2_400_000,
        actual_cost: 1_180_000,
        progress: 52,
      }),
      evm: fallbackEvm("offline-cloud-migration", {
        bac: 2_400_000,
        pv: 1_248_000,
        ev: 1_248_000,
        ac: 1_180_000,
        cpi: 1.06,
        spi: 1.0,
        eac: 2_264_151,
        vac: 135_849,
        planned_pct: 52,
        progress: 52,
      }),
      gates: [
        { id: "og1", project_id: "offline-cloud-migration", gate: "G1", name: "Charter Approved", status: "APPROVED", approver: "Steering Committee", signed_off_at: now, notes: null },
        { id: "og2", project_id: "offline-cloud-migration", gate: "G2", name: "Design Sign-off", status: "APPROVED", approver: "Steering Committee", signed_off_at: now, notes: null },
        { id: "og3", project_id: "offline-cloud-migration", gate: "G3", name: "Migration Go-Live", status: "IN_REVIEW", approver: null, signed_off_at: null, notes: null },
      ],
      raci: [
        { id: "or1", project_id: "offline-cloud-migration", task_or_deliverable: "Network cutover", responsible_id: null, responsible_name: "Infra Lead", accountable_id: null, accountable_name: "Program Sponsor", consulted_id: null, consulted_name: "Security", informed_id: null, informed_name: "All Teams", notes: null },
      ],
      ledger: fallbackLedger("offline-cloud-migration", {
        total_contract_value: 2_600_000,
        billed_to_date: 1_150_000,
        wip: 130_000,
        earned_value: 1_248_000,
        cost_variance: -68_000,
        margin_leakage_pct: 2.6,
        expected_billing_at_progress: 1_352_000,
        billing_gap: -202_000,
        scope_creep_flag: false,
        planned_margin_pct: 18,
      }),
    },
    {
      project: fallbackProject({
        id: "offline-digital-transformation",
        name: "Digital Transformation Program",
        status: "ACTIVE",
        health_score: 61,
        risk_level: "HIGH",
        budget: 4_800_000,
        actual_cost: 2_950_000,
        progress: 58,
      }),
      evm: fallbackEvm("offline-digital-transformation", {
        bac: 4_800_000,
        pv: 2_784_000,
        ev: 2_640_000,
        ac: 2_950_000,
        cpi: 0.89,
        spi: 0.95,
        eac: 5_393_258,
        vac: -593_258,
        planned_pct: 58,
        progress: 55,
        anomalies: [{ metric: "CPI", value: 0.89, level: "warning", message: "Cost performance trending under 0.9" }],
      }),
      gates: [
        { id: "og4", project_id: "offline-digital-transformation", gate: "G1", name: "Charter Approved", status: "APPROVED", approver: "Steering Committee", signed_off_at: now, notes: null },
        { id: "og5", project_id: "offline-digital-transformation", gate: "G2", name: "Design Sign-off", status: "REJECTED", approver: "Steering Committee", signed_off_at: now, notes: "Scope revision requested" },
      ],
      raci: [],
      ledger: fallbackLedger("offline-digital-transformation", {
        total_contract_value: 5_100_000,
        billed_to_date: 2_600_000,
        wip: 350_000,
        earned_value: 2_640_000,
        cost_variance: 310_000,
        margin_leakage_pct: 6.1,
        expected_billing_at_progress: 2_958_000,
        billing_gap: -358_000,
        scope_creep_flag: true,
        planned_margin_pct: 16,
      }),
    },
    {
      project: fallbackProject({
        id: "offline-smart-operations",
        name: "Smart Operations System",
        status: "PLANNING",
        health_score: 88,
        risk_level: "LOW",
        budget: 1_100_000,
        actual_cost: 210_000,
        progress: 14,
      }),
      evm: fallbackEvm("offline-smart-operations", {
        bac: 1_100_000,
        pv: 176_000,
        ev: 154_000,
        ac: 210_000,
        cpi: 0.73,
        spi: 0.88,
        eac: 1_507_042,
        vac: -407_042,
        planned_pct: 16,
        progress: 14,
        anomalies: [{ metric: "CPI", value: 0.73, level: "critical", message: "Cost performance well under plan this early in the project" }],
      }),
      gates: [{ id: "og6", project_id: "offline-smart-operations", gate: "G1", name: "Charter Approved", status: "APPROVED", approver: "Steering Committee", signed_off_at: now, notes: null }],
      raci: [],
      ledger: fallbackLedger("offline-smart-operations", {
        total_contract_value: 1_150_000,
        billed_to_date: 180_000,
        wip: 40_000,
        earned_value: 154_000,
        cost_variance: 56_000,
        margin_leakage_pct: 4.9,
        expected_billing_at_progress: 184_000,
        billing_gap: -4_000,
        scope_creep_flag: false,
        planned_margin_pct: 20,
      }),
    },
  ];
  return rows;
}

/** Three fictional business cases matching the shape api.consulting.businessCases() returns. */
export function buildOfflineConsultingCases(): BusinessCase[] {
  return [
    {
      id: "offline-claims-automation",
      organization_id: "offline-preview",
      name: "Claims Intake Automation",
      business_problem: "Manual claims intake takes 6 days on average and drives rework.",
      current_state: "Paper and email intake triaged manually by a 12-person team.",
      desired_state: "Same-day automated intake with human review only on exceptions.",
      objectives: "Cut intake time to under 24 hours; reduce rework rate below 5%.",
      constraints: "Must integrate with the existing claims platform without a data migration.",
      stakeholders: "Claims Operations, IT, Compliance",
      budget: 850_000,
      timeline: "9 months",
      created_by: null,
      created_at: now,
    },
    {
      id: "offline-supplier-risk",
      organization_id: "offline-preview",
      name: "Supplier Risk Scoring",
      business_problem: "Supplier risk reviews are inconsistent across regions.",
      current_state: "Each region scores suppliers with its own spreadsheet template.",
      desired_state: "One standardized, auditable risk score across all regions.",
      objectives: "Single scoring model live in 3 regions within two quarters.",
      constraints: "Must preserve existing supplier IDs across systems.",
      stakeholders: "Procurement, Risk, Regional Ops Leads",
      budget: 420_000,
      timeline: "6 months",
      created_by: null,
      created_at: now,
    },
    {
      id: "offline-field-scheduling",
      organization_id: "offline-preview",
      name: "Field Technician Scheduling",
      business_problem: "Dispatch relies on tribal knowledge, causing avoidable overtime.",
      current_state: "Dispatchers assign jobs manually by phone and radio.",
      desired_state: "Optimized routing and scheduling with dispatcher override.",
      objectives: "Reduce overtime hours 20%; cut average response time 15%.",
      constraints: "Field crews use low-connectivity mobile devices.",
      stakeholders: "Field Operations, Dispatch, Finance",
      budget: 610_000,
      timeline: "8 months",
      created_by: null,
      created_at: now,
    },
  ];
}

/** Runs `loader`, bounded by `withTimeout`; on any failure (including timeout) falls back to
 * `buildFallback()` and reports that via the returned `offline` flag so the caller can render
 * the same visible "offline preview" banner used across this module — never silent, never
 * indistinguishable from a real response. Shared by the list pages below (Projects, Tasks,
 * Risks, Resources, Budget) since they all follow the same "fetch one list, degrade to one
 * fallback list" shape. */
export async function withOfflineFallback<T>(loader: () => Promise<T>, buildFallback: () => T): Promise<{ data: T; offline: boolean }> {
  try {
    const data = await withTimeout(loader());
    return { data, offline: false };
  } catch {
    return { data: buildFallback(), offline: true };
  }
}

/** Three fictional projects shared across the Projects/Tasks/Risks/Resources/Budget fallbacks
 * (same ids as buildOfflinePmoPortfolio's rows above, so a task/risk's project_id resolves to a
 * real-looking project name if a visitor cross-references pages while offline). */
export function buildOfflineProjects(): Project[] {
  return [
    fallbackProject({
      id: "offline-cloud-migration",
      name: "Cloud Migration Initiative",
      client: "Internal IT",
      status: "ACTIVE",
      priority: "HIGH",
      health_score: 78,
      risk_level: "MEDIUM",
      budget: 2_400_000,
      actual_cost: 1_180_000,
      progress: 52,
    }),
    fallbackProject({
      id: "offline-digital-transformation",
      name: "Digital Transformation Program",
      client: "Northbridge Financial",
      status: "AT_RISK",
      priority: "CRITICAL",
      health_score: 61,
      risk_level: "HIGH",
      budget: 4_800_000,
      actual_cost: 2_950_000,
      progress: 55,
    }),
    fallbackProject({
      id: "offline-smart-operations",
      name: "Smart Operations System",
      client: "Halcyon Manufacturing",
      status: "PLANNING",
      priority: "MEDIUM",
      health_score: 88,
      risk_level: "LOW",
      budget: 1_100_000,
      actual_cost: 210_000,
      progress: 14,
    }),
  ];
}

function fallbackTask(overrides: Partial<Task> & Pick<Task, "id" | "project_id" | "title">): Task {
  return {
    description: null,
    assignee_id: null,
    assignee_name: "Unassigned",
    status: "TODO",
    priority: "MEDIUM",
    estimated_hours: 40,
    actual_hours: 0,
    start_date: now,
    due_date: now,
    completion_percentage: 0,
    required_skills: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

export function buildOfflineTasks(): Task[] {
  return [
    fallbackTask({ id: "offline-t1", project_id: "offline-cloud-migration", title: "Network cutover rehearsal", assignee_name: "Infra Lead", status: "IN_PROGRESS", priority: "HIGH", completion_percentage: 65 }),
    fallbackTask({ id: "offline-t2", project_id: "offline-cloud-migration", title: "Legacy data migration validation", assignee_name: "Data Eng", status: "REVIEW", completion_percentage: 90 }),
    fallbackTask({ id: "offline-t3", project_id: "offline-digital-transformation", title: "ERP licensing renegotiation", assignee_name: "Procurement", status: "BLOCKED", priority: "CRITICAL", completion_percentage: 20 }),
    fallbackTask({ id: "offline-t4", project_id: "offline-digital-transformation", title: "Change management rollout", assignee_name: "PMO", status: "TODO", completion_percentage: 0 }),
    fallbackTask({ id: "offline-t5", project_id: "offline-digital-transformation", title: "Integration test cycle 2", assignee_name: "QA Lead", status: "IN_PROGRESS", completion_percentage: 40 }),
    fallbackTask({ id: "offline-t6", project_id: "offline-smart-operations", title: "Sensor telemetry pipeline design", assignee_name: "IoT Eng", status: "TODO", completion_percentage: 0 }),
    fallbackTask({ id: "offline-t7", project_id: "offline-smart-operations", title: "Vendor evaluation shortlist", assignee_name: "Ops Lead", status: "DONE", completion_percentage: 100 }),
    fallbackTask({ id: "offline-t8", project_id: "offline-cloud-migration", title: "Security posture review", assignee_name: "SecOps", status: "REVIEW", priority: "HIGH", completion_percentage: 75 }),
  ];
}

function fallbackRisk(overrides: Partial<Risk> & Pick<Risk, "id" | "project_id" | "title" | "category" | "probability" | "impact" | "score" | "severity">): Risk {
  return {
    description: null,
    owner: null,
    mitigation: null,
    status: "OPEN",
    ...overrides,
  };
}

const OFFLINE_PROJECT_NAMES: Record<string, string> = {
  "offline-cloud-migration": "Cloud Migration Initiative",
  "offline-digital-transformation": "Digital Transformation Program",
  "offline-smart-operations": "Smart Operations System",
};

/** Returned shape matches api.allRisks()'s ad-hoc `Risk & { project_name?: string }` enrichment
 * (see app/app/risks/page.tsx) — plain JS here since this file never type-checks at runtime
 * anyway, but the extra field flows through the same way. */
export function buildOfflineRisks() {
  const risks = [
    fallbackRisk({ id: "offline-r1", project_id: "offline-digital-transformation", title: "ERP licensing costs exceeding estimates", category: "BUDGET", probability: 4, impact: 5, score: 20, severity: "CRITICAL", owner: "Finance Lead", status: "OPEN" }),
    fallbackRisk({ id: "offline-r2", project_id: "offline-digital-transformation", title: "Key integration vendor understaffed", category: "RESOURCE", probability: 3, impact: 4, score: 12, severity: "HIGH", owner: "Program Director", status: "MITIGATING" }),
    fallbackRisk({ id: "offline-r3", project_id: "offline-cloud-migration", title: "Cutover window conflicts with peak traffic", category: "SCHEDULE", probability: 3, impact: 3, score: 9, severity: "MEDIUM", owner: "Infra Lead", status: "MITIGATING" }),
    fallbackRisk({ id: "offline-r4", project_id: "offline-cloud-migration", title: "Data residency requirement unresolved", category: "SECURITY", probability: 2, impact: 4, score: 8, severity: "MEDIUM", owner: "Compliance", status: "OPEN" }),
    fallbackRisk({ id: "offline-r5", project_id: "offline-smart-operations", title: "Sensor hardware lead times slipping", category: "EXTERNAL", probability: 2, impact: 2, score: 4, severity: "LOW", owner: "Ops Lead", status: "OPEN" }),
  ];
  return risks.map((r) => ({ ...r, project_name: OFFLINE_PROJECT_NAMES[r.project_id] }));
}

export function buildOfflineResources(): Resource[] {
  return [
    { id: "offline-res1", organization_id: "offline-preview", name: "Infra Lead", role: "Infrastructure Engineer", department: "Engineering", skills: ["Networking", "Cloud"], hourly_cost: 145, capacity_hours_per_week: 40, current_workload_hours_per_week: 38, utilization_state: "OPTIMAL" },
    { id: "offline-res2", organization_id: "offline-preview", name: "Data Eng", role: "Data Engineer", department: "Engineering", skills: ["ETL", "SQL"], hourly_cost: 130, capacity_hours_per_week: 40, current_workload_hours_per_week: 44, utilization_state: "OVERLOADED" },
    { id: "offline-res3", organization_id: "offline-preview", name: "PMO", role: "Program Manager", department: "PMO", skills: ["Change Management"], hourly_cost: 160, capacity_hours_per_week: 40, current_workload_hours_per_week: 30, utilization_state: "UNDERUTILIZED" },
    { id: "offline-res4", organization_id: "offline-preview", name: "QA Lead", role: "QA Engineer", department: "Engineering", skills: ["Test Automation"], hourly_cost: 110, capacity_hours_per_week: 40, current_workload_hours_per_week: 36, utilization_state: "OPTIMAL" },
    { id: "offline-res5", organization_id: "offline-preview", name: "IoT Eng", role: "IoT Engineer", department: "Engineering", skills: ["Embedded", "Telemetry"], hourly_cost: 125, capacity_hours_per_week: 40, current_workload_hours_per_week: 12, utilization_state: "UNDERUTILIZED" },
    { id: "offline-res6", organization_id: "offline-preview", name: "SecOps", role: "Security Engineer", department: "Security", skills: ["AppSec", "Cloud Security"], hourly_cost: 155, capacity_hours_per_week: 40, current_workload_hours_per_week: 41, utilization_state: "OVERLOADED" },
  ];
}

// variance = forecasted_final_cost - budget (positive = projected over budget); variance_percent
// is that same figure as a percentage of budget — both fields must carry the same sign, or the
// budget page's "+" prefix (added whenever variance > 0) collides with a negative percent and
// renders as "+-5.7%".
const FALLBACK_FORECASTS: Record<string, CostForecast> = {
  "offline-cloud-migration": { forecasted_final_cost: 2_264_151, method: "linear-progress-baseline", variance: -135_849, variance_percent: -5.7, overrun_probability: 0.12 },
  "offline-digital-transformation": { forecasted_final_cost: 5_393_258, method: "linear-progress-baseline", variance: 593_258, variance_percent: 12.4, overrun_probability: 0.68 },
  "offline-smart-operations": { forecasted_final_cost: 1_507_042, method: "linear-progress-baseline", variance: 407_042, variance_percent: 37.0, overrun_probability: 0.81 },
};

export function buildOfflineForecast(projectId: string): CostForecast | null {
  return FALLBACK_FORECASTS[projectId] ?? null;
}

/** Matches AnalyticsSummary (lib/types.ts) — an 8-week illustrative trend, not the real
 * analytics endpoint's output. */
export function buildOfflineAnalytics() {
  const budget_burn_trend = Array.from({ length: 8 }, (_, i) => {
    const week = i + 1;
    const period_spend = 380_000 + Math.round(Math.sin(i / 2) * 60_000);
    return {
      date: new Date(Date.UTC(2026, 6, 6 + i * 7)).toISOString().slice(0, 10),
      period_spend,
      cumulative_spend: 380_000 * week + Math.round(Math.sin(i / 2) * 60_000) * week,
    };
  });

  const task_completion_trend = Array.from({ length: 8 }, (_, i) => {
    const due = 18 + i * 9;
    const completed = Math.round(due * (0.55 + i * 0.04));
    return {
      period: `Week ${i + 1}`,
      period_end: new Date(Date.UTC(2026, 6, 6 + i * 7)).toISOString().slice(0, 10),
      tasks_due_cumulative: due,
      tasks_completed_cumulative: completed,
      completion_rate_pct: Math.round((completed / due) * 1000) / 10,
    };
  });

  return {
    generated_at: now,
    organization_name: "Offline Preview",
    total_projects: 3,
    total_budget: 8_300_000,
    total_actual_cost: 4_340_000,
    budget_burn_trend,
    task_completion_trend,
    risk_snapshot: {
      as_of: now,
      severity_counts: { LOW: 1, MEDIUM: 2, HIGH: 1, CRITICAL: 1 },
      status_counts: { OPEN: 3, MITIGATING: 2, CLOSED: 0 },
      open_count: 3,
      closed_count: 0,
      note: "Offline preview snapshot — not the real risk register.",
    },
  };
}

/** Matches DashboardSummary (lib/types.ts). Figures are consistent with buildOfflineProjects /
 * buildOfflineRisks above (same 3 projects, same risk mix) rather than independently invented,
 * so a visitor who checks more than one offline page sees numbers that add up. */
export function buildOfflineDashboard() {
  return {
    total_projects: 3,
    active_projects: 1,
    completed_projects: 0,
    at_risk_projects: 1,
    avg_health_score: Math.round((78 + 61 + 88) / 3),
    budget_utilization_pct: Math.round((4_340_000 / 8_300_000) * 1000) / 10,
    resource_utilization_pct: 68.4,
    upcoming_deadlines: [
      { id: "offline-t3", name: "ERP licensing renegotiation", due_date: now, type: "TASK" as const },
      { id: "offline-t1", name: "Network cutover rehearsal", due_date: now, type: "TASK" as const },
      { id: "offline-m1", name: "G3 sign-off — Cloud Migration Initiative", due_date: now, type: "MILESTONE" as const },
    ],
    total_budget: 8_300_000,
    total_actual_cost: 4_340_000,
    risk_counts: { LOW: 1, MEDIUM: 2, HIGH: 1, CRITICAL: 1 },
    projects_by_status: { PLANNING: 1, ACTIVE: 1, ON_HOLD: 0, AT_RISK: 1, COMPLETED: 0, CANCELLED: 0 },
  };
}
