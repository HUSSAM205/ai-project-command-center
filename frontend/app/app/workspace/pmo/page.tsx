"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle, TrendingDown } from "lucide-react";
import { api } from "@/lib/api";
import { pmoApi } from "@/lib/api-pmo";
import { useApi } from "@/lib/useApi";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Badge, type SemanticTone } from "@/components/ui/Badge";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { OfflinePreviewBanner } from "@/components/ui/OfflinePreviewBanner";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/LoadingState";
import { MetricCard } from "@/components/ui/MetricCard";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { Select } from "@/components/ui/Select";
import { cn, formatCompactCurrency, formatCurrency, formatPercent, titleCase } from "@/lib/utils";
import type { ContractLedger, EVM, Project, RaciEntry, StageGate, StageGateNumber } from "@/lib/types";
import { STAGE_GATE_ORDER } from "@/lib/types";
import { buildOfflinePmoPortfolio, withTimeout } from "@/lib/offlinePreview";

interface ProjectPmo {
  project: Project;
  evm: EVM | null;
  gates: StageGate[];
  raci: RaciEntry[];
  ledger: ContractLedger | null;
}

interface PortfolioPmoResult {
  rows: ProjectPmo[];
  offline: boolean;
}

/** Fetches the same per-project PMO endpoints the project detail page's PMO tab already calls
 * (pmoApi.evm/stageGates/raci/contractLedger — backend/app/api/pmo.py) for every project, then
 * combines them client-side — the same aggregation shape as lib/api.ts's allTasks()/allRisks()
 * helpers use for their own cross-project rollups. No new backend endpoint. The contract ledger
 * fetch is what powers the scope-creep what-if simulator and realization-rate table below.
 *
 * Individual project rows already degrade field-by-field on a per-call failure (the .catch()s
 * below). The only way this whole page used to fail outright was api.projects() itself throwing
 * — after GET auto-retry (lib/api.ts) is exhausted, or the load hanging past
 * offlinePreview.OVERALL_TIMEOUT_MS. In that case, fall back to a static, clearly-labeled
 * fictional portfolio (lib/offlinePreview.ts) instead of a bare error box — this page is
 * public-facing, so "always renders something real-looking, honestly labeled" beats "sometimes
 * shows a red crash". The `offline` flag drives the banner in the page body below. */
async function loadPortfolioPmo(): Promise<PortfolioPmoResult> {
  try {
    const projects = await withTimeout(api.projects());
    const rows = await Promise.all(
      projects.map(async (project) => {
        const [evm, gates, raci, ledger] = await Promise.all([
          pmoApi.evm(project.id).catch(() => null),
          pmoApi.stageGates(project.id).catch(() => [] as StageGate[]),
          pmoApi.raci(project.id).catch(() => [] as RaciEntry[]),
          pmoApi.contractLedger(project.id).catch(() => null),
        ]);
        return { project, evm, gates, raci, ledger };
      }),
    );
    return { rows, offline: false };
  } catch {
    return { rows: buildOfflinePmoPortfolio(), offline: true };
  }
}

function stageGateStatusTone(status: string): SemanticTone {
  switch (status) {
    case "APPROVED":
      return "success";
    case "IN_REVIEW":
      return "info";
    case "REJECTED":
      return "critical";
    default:
      return "neutral";
  }
}

export default function PmoWorkspacePage() {
  const portfolio = useApi(loadPortfolioPmo, []);
  const rows = useMemo(() => portfolio.data?.rows ?? [], [portfolio.data]);
  const offline = portfolio.data?.offline ?? false;

  const rollup = useMemo(() => {
    const withEvm = rows.filter((r): r is ProjectPmo & { evm: EVM } => r.evm !== null);
    const bac = withEvm.reduce((s, r) => s + r.evm.bac, 0);
    const pv = withEvm.reduce((s, r) => s + r.evm.pv, 0);
    const ev = withEvm.reduce((s, r) => s + r.evm.ev, 0);
    const ac = withEvm.reduce((s, r) => s + r.evm.ac, 0);
    const eac = withEvm.reduce((s, r) => s + r.evm.eac, 0);
    const cpi = ac > 0 ? ev / ac : null;
    const spi = pv > 0 ? ev / pv : null;
    const vac = bac - eac;
    return { bac, pv, ev, ac, eac, cpi, spi, vac, count: withEvm.length };
  }, [rows]);

  const gatesByProject = useMemo(() => {
    const map = new Map<string, Map<StageGateNumber, StageGate>>();
    for (const r of rows) {
      map.set(r.project.id, new Map(r.gates.map((g) => [g.gate, g])));
    }
    return map;
  }, [rows]);

  const raciRollup = useMemo(
    () =>
      rows.map((r) => ({
        project: r.project,
        total: r.raci.length,
        missingAccountable: r.raci.filter((e) => !e.accountable_id).length,
      })),
    [rows],
  );

  const evmColumns: Column<ProjectPmo>[] = [
    {
      key: "name",
      header: "Project",
      sortValue: (r) => r.project.name,
      render: (r) => (
        <Link href={`/app/projects/${r.project.id}`} className="font-medium text-text-primary hover:text-brand-700 dark:hover:text-brand-300">
          {r.project.name}
        </Link>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => {
        if (!r.evm) return "—";
        const cv = r.evm.ev - r.evm.ac;
        const sv = r.evm.ev - r.evm.pv;
        return (
          <div className="flex flex-wrap gap-1">
            <Badge tone={cv < 0 ? "critical" : "success"} dot>
              {cv < 0 ? "Over budget" : "On budget"}
            </Badge>
            <Badge tone={sv < 0 ? "critical" : "success"} dot>
              {sv < 0 ? "Delayed" : "Ahead"}
            </Badge>
          </div>
        );
      },
    },
    { key: "cpi", header: "CPI", align: "right", sortValue: (r) => r.evm?.cpi ?? -1, render: (r) => (r.evm?.cpi != null ? r.evm.cpi.toFixed(2) : "—") },
    { key: "spi", header: "SPI", align: "right", sortValue: (r) => r.evm?.spi ?? -1, render: (r) => (r.evm?.spi != null ? r.evm.spi.toFixed(2) : "—") },
    {
      key: "eac",
      header: "EAC",
      align: "right",
      sortValue: (r) => r.evm?.eac ?? 0,
      render: (r) => (r.evm ? <span className="font-tabular">{formatCompactCurrency(r.evm.eac)}</span> : "—"),
    },
    {
      key: "vac",
      header: "VAC",
      align: "right",
      sortValue: (r) => r.evm?.vac ?? 0,
      render: (r) =>
        r.evm ? (
          <span className={cn("font-tabular", r.evm.vac < 0 ? "text-critical-fg" : "text-success-fg")}>
            {formatCompactCurrency(r.evm.vac)}
          </span>
        ) : (
          "—"
        ),
    },
    {
      key: "anomalies",
      header: "Anomalies",
      render: (r) =>
        r.evm && r.evm.anomalies.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {r.evm.anomalies.map((a) => (
              <Badge key={a.metric} tone={a.level === "critical" ? "critical" : "warning"} dot>
                {a.metric}
              </Badge>
            ))}
          </div>
        ) : (
          <span className="text-text-tertiary">None</span>
        ),
    },
  ];

  const raciColumns: Column<(typeof raciRollup)[number]>[] = [
    {
      key: "name",
      header: "Project",
      sortValue: (r) => r.project.name,
      render: (r) => (
        <Link href={`/app/projects/${r.project.id}`} className="font-medium text-text-primary hover:text-brand-700 dark:hover:text-brand-300">
          {r.project.name}
        </Link>
      ),
    },
    { key: "total", header: "RACI entries", align: "right", sortValue: (r) => r.total, render: (r) => <span className="font-tabular">{r.total}</span> },
    {
      key: "gap",
      header: "Missing Accountable",
      align: "right",
      sortValue: (r) => r.missingAccountable,
      render: (r) =>
        r.missingAccountable > 0 ? (
          <Badge tone="warning" dot>
            {r.missingAccountable}
          </Badge>
        ) : (
          <span className="text-text-tertiary">0</span>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="bg-gradient-to-r from-text-primary to-text-tertiary bg-clip-text text-xl font-semibold text-transparent">
            PMO Workspace
          </h1>
          <p className="mt-1 text-sm text-text-tertiary">
            Portfolio-wide rollup of the real EVM, stage-gate, and RACI data already tracked per project.
          </p>
        </div>
        {offline && <OfflinePreviewBanner onRetry={portfolio.reload} subject="portfolio data" inline className="mt-1" />}
      </div>

      {portfolio.loading ? (
        <div className="flex h-64 items-center justify-center">
          <Spinner />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState title="No projects yet" description="Portfolio EVM/stage-gate/RACI rollups appear once at least one project exists." />
      ) : (
        <>
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Portfolio EVM Rollup</CardTitle>
                <CardDescription>
                  Sum-based aggregation across {rollup.count} project{rollup.count === 1 ? "" : "s"} with EVM data — Portfolio CPI = ΣEV / ΣAC,
                  Portfolio SPI = ΣEV / ΣPV, Portfolio VAC = ΣBAC − ΣEAC. Each project&apos;s own EVM is computed by
                  app/services/evm.py; nothing here is recomputed differently, only summed.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
                <MetricCard label="BAC" value={<AnimatedNumber value={rollup.bac} format={(n) => formatCompactCurrency(n)} />} />
                <MetricCard label="PV" value={<AnimatedNumber value={rollup.pv} format={(n) => formatCompactCurrency(n)} />} />
                <MetricCard label="EV" value={<AnimatedNumber value={rollup.ev} format={(n) => formatCompactCurrency(n)} />} />
                <MetricCard label="AC" value={<AnimatedNumber value={rollup.ac} format={(n) => formatCompactCurrency(n)} />} />
                <MetricCard label="CPI" value={rollup.cpi != null ? rollup.cpi.toFixed(2) : "—"} />
                <MetricCard label="SPI" value={rollup.spi != null ? rollup.spi.toFixed(2) : "—"} />
              </div>
              <div className="mt-4 flex items-center justify-between rounded-md border border-border-default bg-subtle/50 px-3.5 py-3 text-sm">
                <span className="text-text-secondary">Portfolio VAC (BAC − EAC)</span>
                <span className={cn("font-tabular font-semibold", rollup.vac < 0 ? "text-critical-fg" : "text-success-fg")}>
                  {formatCompactCurrency(rollup.vac)}
                </span>
              </div>
            </CardContent>
          </Card>

          <ScopeCreepSimulatorCard rows={rows} />

          <RealizationRateCard rows={rows} />

          <Card>
            <CardHeader>
              <div>
                <CardTitle>EVM by Project</CardTitle>
                <CardDescription>Each row is that project&apos;s real, independently-computed EVM snapshot</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <DataTable columns={evmColumns} rows={rows} getRowKey={(r) => r.project.id} emptyTitle="No projects" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Cross-Project Stage Gates</CardTitle>
                <CardDescription>G1 through G5 sign-off status per project</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border-default bg-subtle/60">
                      <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-text-tertiary">Project</th>
                      {STAGE_GATE_ORDER.map((g) => (
                        <th key={g} className="px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                          {g}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const gates = gatesByProject.get(r.project.id) ?? new Map();
                      return (
                        <tr key={r.project.id} className="border-b border-border-default last:border-0">
                          <td className="px-4 py-3">
                            <Link href={`/app/projects/${r.project.id}`} className="font-medium text-text-primary hover:text-brand-700 dark:hover:text-brand-300">
                              {r.project.name}
                            </Link>
                          </td>
                          {STAGE_GATE_ORDER.map((g) => {
                            const gate = gates.get(g);
                            return (
                              <td key={g} className="px-4 py-3 text-center">
                                {gate ? (
                                  <Badge tone={stageGateStatusTone(gate.status)}>{titleCase(gate.status)}</Badge>
                                ) : (
                                  <span className="text-text-tertiary">—</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {rows.every((r) => r.gates.length === 0) && (
                <p className="mt-3 text-xs text-text-tertiary">No stage gates defined for any project yet.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Cross-Project RACI Summary</CardTitle>
                <CardDescription>Entry counts and accountability gaps per project&apos;s RACI matrix</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <DataTable columns={raciColumns} rows={raciRollup} getRowKey={(r) => r.project.id} emptyTitle="No RACI entries anywhere yet" />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Task 1: Scope-Creep / Margin-Leakage what-if simulator. Real, current numbers come straight
// from the already-documented contract-ledger formula (app/services/contract_ledger.py — see
// docs/PRODUCT_REQUIREMENTS.md's cross-reference); the slider only changes what actual_cost is
// *hypothetically* assumed to be, then re-runs the exact same formula client-side. Nothing about
// the underlying data changes — this never writes anything back, and the baseline (real) figure
// is always shown alongside the simulated one so the two can never be mistaken for each other.
// ---------------------------------------------------------------------------------------------

const SCOPE_CREEP_CHANGE_ORDER_THRESHOLD = 15; // simulated leakage % above which a change order is recommended
const SCOPE_CREEP_DESCOPE_THRESHOLD = 30; // simulated leakage % above which autonomous de-scoping is recommended

function clampPct(n: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, n));
}

function ScopeCreepSimulatorCard({ rows }: { rows: ProjectPmo[] }) {
  const withLedger = useMemo(() => rows.filter((r): r is ProjectPmo & { ledger: ContractLedger } => r.ledger !== null), [rows]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [scopeCreepPct, setScopeCreepPct] = useState(0);

  const selected = withLedger.find((r) => r.project.id === selectedId) ?? withLedger[0] ?? null;

  const sim = useMemo(() => {
    if (!selected) return null;
    const { ledger, project } = selected;
    const tcv = ledger.total_contract_value;
    const actualCost = project.actual_cost; // real field — GET /projects
    const earnedValue = ledger.earned_value; // real, from the contract-ledger endpoint

    // Baseline: exactly the real, current server-computed figures — not recomputed differently.
    const baselineLeakagePct = ledger.margin_leakage_pct;
    const baselineCostVariance = ledger.cost_variance;

    // What-if: actual_cost grows by the slider's percentage (simulated additional scope-driven
    // cost); earned_value is untouched since it reflects real progress made, not a hypothetical.
    const simulatedActualCost = actualCost * (1 + scopeCreepPct / 100);
    const simulatedCostVariance = simulatedActualCost - earnedValue;
    const simulatedLeakagePct = tcv > 0 ? clampPct((simulatedCostVariance / tcv) * 100) : 0;
    const additionalCost = simulatedActualCost - actualCost;
    const leakageDollarBaseline = (baselineLeakagePct / 100) * tcv;
    const leakageDollarSimulated = (simulatedLeakagePct / 100) * tcv;

    const realizationRate = actualCost > 0 ? (ledger.billed_to_date / actualCost) * 100 : null;

    return {
      tcv,
      actualCost,
      earnedValue,
      baselineLeakagePct,
      baselineCostVariance,
      simulatedActualCost,
      simulatedCostVariance,
      simulatedLeakagePct,
      additionalCost,
      leakageDollarBaseline,
      leakageDollarSimulated,
      realizationRate,
    };
  }, [selected, scopeCreepPct]);

  const recommendation: { label: string; tone: SemanticTone } | null = !sim
    ? null
    : sim.simulatedLeakagePct > SCOPE_CREEP_DESCOPE_THRESHOLD
      ? { label: "Recommend: Autonomous De-Scoping", tone: "critical" }
      : sim.simulatedLeakagePct > SCOPE_CREEP_CHANGE_ORDER_THRESHOLD
        ? { label: "Recommend: Issue Formal Change Order", tone: "warning" }
        : null;

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4 text-warning-fg" aria-hidden="true" />
            Scope-Creep / Margin-Leakage What-If Simulator
          </CardTitle>
          <CardDescription>
            A what-if simulator over real current data — not a live measurement. Drag the slider to see how additional
            scope-driven cost would affect margin leakage, using the real, documented formula: margin_leakage_pct =
            clamp((actual_cost − earned_value) / total_contract_value × 100, 0, 100).
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {withLedger.length === 0 ? (
          <EmptyState title="No contract ledger data yet" description="This simulator needs at least one project with a contract ledger set up." />
        ) : (
          <div className="space-y-5">
            <Select
              label="Project"
              value={selected?.project.id ?? ""}
              onChange={(e) => setSelectedId(e.target.value)}
              options={withLedger.map((r) => ({ label: r.project.name, value: r.project.id }))}
            />

            {sim && (
              <>
                <div>
                  <div className="flex items-center justify-between text-sm">
                    <label htmlFor="scope-creep-slider" className="font-medium text-text-primary">
                      Hypothetical additional scope creep
                    </label>
                    <span className="font-tabular font-semibold text-text-primary">+{scopeCreepPct}%</span>
                  </div>
                  <input
                    id="scope-creep-slider"
                    type="range"
                    min={0}
                    max={50}
                    step={1}
                    value={scopeCreepPct}
                    onChange={(e) => setScopeCreepPct(Number(e.target.value))}
                    className="mt-2 w-full accent-brand-600"
                    aria-label="Hypothetical additional scope creep percentage"
                  />
                  <p className="mt-1 text-xs text-text-tertiary">
                    Simulates actual_cost increasing by this percentage (additional scope-driven cost), 0–50%.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="rounded-md border border-border-default bg-subtle/40 p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">Baseline (real, current)</p>
                    <p className="mt-1.5 font-tabular text-2xl font-semibold text-text-primary">{formatPercent(sim.baselineLeakagePct, 1)}</p>
                    <p className="mt-0.5 font-tabular text-xs text-text-tertiary">{formatCurrency(sim.leakageDollarBaseline)} of TCV</p>
                  </div>
                  <div
                    className={cn(
                      "rounded-md border p-4",
                      scopeCreepPct > 0 ? "border-warning-border bg-warning-bg/40" : "border-border-default bg-subtle/40",
                    )}
                  >
                    <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">
                      Simulated (+{scopeCreepPct}% cost)
                    </p>
                    <p
                      className={cn(
                        "mt-1.5 font-tabular text-2xl font-semibold",
                        sim.simulatedLeakagePct > sim.baselineLeakagePct ? "text-critical-fg" : "text-text-primary",
                      )}
                    >
                      <AnimatedNumber value={sim.simulatedLeakagePct} format={(n) => formatPercent(n, 1)} />
                    </p>
                    <p className="mt-0.5 font-tabular text-xs text-text-tertiary">
                      <AnimatedNumber value={sim.leakageDollarSimulated} format={(n) => formatCurrency(n)} /> of TCV
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border-default bg-subtle/30 px-3.5 py-3 text-sm">
                  <span className="flex items-center gap-2 text-text-secondary">
                    <TrendingDown className="h-4 w-4 text-critical-fg" aria-hidden="true" />
                    Additional simulated cost at +{scopeCreepPct}%
                  </span>
                  <span className="font-tabular font-semibold text-critical-fg">
                    <AnimatedNumber value={sim.additionalCost} format={(n) => formatCurrency(n)} />
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {recommendation ? (
                    <Badge tone={recommendation.tone} dot>
                      {recommendation.label}
                    </Badge>
                  ) : (
                    <Badge tone="neutral">No threshold breached</Badge>
                  )}
                  <span className="text-[11px] text-text-tertiary">
                    Rule-based recommendation from a simple disclosed threshold (&gt;{SCOPE_CREEP_CHANGE_ORDER_THRESHOLD}% → change order,
                    &gt;{SCOPE_CREEP_DESCOPE_THRESHOLD}% → autonomous de-scoping) — not an AI judgment.
                  </span>
                </div>

                <div className="border-t border-border-default pt-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-text-secondary">Partner Realization Rate</span>
                    <span className="font-tabular font-semibold text-text-primary">
                      {sim.realizationRate != null ? formatPercent(sim.realizationRate, 1) : "—"}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-text-tertiary">
                    realization_rate = billed_to_date / actual_cost × 100 — real fields from this project&apos;s contract
                    ledger and budget data, unaffected by the slider above.
                  </p>
                </div>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Partner Realization Rate across every project with contract-ledger data — the same real
 * `billed_to_date / actual_cost` formula shown per-project above, rolled up portfolio-wide. */
function RealizationRateCard({ rows }: { rows: ProjectPmo[] }) {
  const data = useMemo(
    () =>
      rows
        .filter((r): r is ProjectPmo & { ledger: ContractLedger } => r.ledger !== null)
        .map((r) => ({
          project: r.project,
          billed: r.ledger.billed_to_date,
          actualCost: r.project.actual_cost,
          realizationRate: r.project.actual_cost > 0 ? (r.ledger.billed_to_date / r.project.actual_cost) * 100 : null,
        })),
    [rows],
  );

  const columns: Column<(typeof data)[number]>[] = [
    {
      key: "name",
      header: "Project",
      sortValue: (r) => r.project.name,
      render: (r) => (
        <Link href={`/app/projects/${r.project.id}`} className="font-medium text-text-primary hover:text-brand-700 dark:hover:text-brand-300">
          {r.project.name}
        </Link>
      ),
    },
    { key: "billed", header: "Billed to date", align: "right", sortValue: (r) => r.billed, render: (r) => <span className="font-tabular">{formatCompactCurrency(r.billed)}</span> },
    { key: "cost", header: "Actual cost", align: "right", sortValue: (r) => r.actualCost, render: (r) => <span className="font-tabular">{formatCompactCurrency(r.actualCost)}</span> },
    {
      key: "rate",
      header: "Realization rate",
      align: "right",
      sortValue: (r) => r.realizationRate ?? -1,
      render: (r) =>
        r.realizationRate != null ? (
          <span className={cn("font-tabular font-semibold", r.realizationRate >= 100 ? "text-success-fg" : "text-warning-fg")}>
            {formatPercent(r.realizationRate, 1)}
          </span>
        ) : (
          "—"
        ),
    },
  ];

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Partner Realization Rate</CardTitle>
          <CardDescription>
            realization_rate = billed_to_date / actual_cost × 100 — a standard consulting metric (billed vs. cost),
            derived from real contract-ledger and budget fields already fetched for this portfolio. 100%+ means billing
            has kept pace with (or exceeded) cost incurred; below 100% means cost is outpacing billing.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <DataTable columns={columns} rows={data} getRowKey={(r) => r.project.id} emptyTitle="No contract ledger data yet" />
      </CardContent>
    </Card>
  );
}
