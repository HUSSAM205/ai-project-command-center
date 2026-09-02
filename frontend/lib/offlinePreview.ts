import type { BusinessCase, ContractLedger, EVM, Project, RaciEntry, StageGate } from "./types";

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
 * below is fictional (same "Vertex Technologies" demo org already seeded in the database),
 * never a real company name.
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
  return {
    organization_id: "offline-preview",
    description: null,
    client: null,
    manager_id: null,
    manager_name: "—",
    status: "ACTIVE",
    priority: "HIGH",
    start_date: now,
    end_date: now,
    budget: 0,
    actual_cost: 0,
    progress: 0,
    health_score: 0,
    risk_level: "MEDIUM",
    created_at: now,
    updated_at: now,
    ...overrides,
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
