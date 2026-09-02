"use client";

import Link from "next/link";
import { useMemo } from "react";
import { api } from "@/lib/api";
import { pmoApi } from "@/lib/api-pmo";
import { useApi } from "@/lib/useApi";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Badge, type SemanticTone } from "@/components/ui/Badge";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/LoadingState";
import { MetricCard } from "@/components/ui/MetricCard";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { cn, formatCompactCurrency, titleCase } from "@/lib/utils";
import type { EVM, Project, RaciEntry, StageGate, StageGateNumber } from "@/lib/types";
import { STAGE_GATE_ORDER } from "@/lib/types";

interface ProjectPmo {
  project: Project;
  evm: EVM | null;
  gates: StageGate[];
  raci: RaciEntry[];
}

/** Fetches the same per-project PMO endpoints the project detail page's PMO tab already calls
 * (pmoApi.evm/stageGates/raci — backend/app/api/pmo.py) for every project, then combines them
 * client-side — the same aggregation shape as lib/api.ts's allTasks()/allRisks() helpers use for
 * their own cross-project rollups. No new backend endpoint. */
async function loadPortfolioPmo(): Promise<ProjectPmo[]> {
  const projects = await api.projects();
  return Promise.all(
    projects.map(async (project) => {
      const [evm, gates, raci] = await Promise.all([
        pmoApi.evm(project.id).catch(() => null),
        pmoApi.stageGates(project.id).catch(() => [] as StageGate[]),
        pmoApi.raci(project.id).catch(() => [] as RaciEntry[]),
      ]);
      return { project, evm, gates, raci };
    }),
  );
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
  const rows = useMemo(() => portfolio.data ?? [], [portfolio.data]);

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
      <div>
        <h1 className="text-xl font-semibold text-text-primary">PMO Workspace</h1>
        <p className="mt-1 text-sm text-text-tertiary">
          Portfolio-wide rollup of the real EVM, stage-gate, and RACI data already tracked per project.
        </p>
      </div>

      {portfolio.error ? (
        <ErrorState description={portfolio.error.message} offline={portfolio.error.message?.includes("offline")} onRetry={portfolio.reload} />
      ) : portfolio.loading ? (
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
