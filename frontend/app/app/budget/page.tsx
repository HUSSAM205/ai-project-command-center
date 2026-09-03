"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import type { CostForecast, Project } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { MetricCard } from "@/components/ui/MetricCard";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { OfflinePreviewBanner } from "@/components/ui/OfflinePreviewBanner";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { formatCompactCurrency, formatCurrency, formatPercent } from "@/lib/utils";
import { buildOfflineForecast, buildOfflineProjects, withOfflineFallback } from "@/lib/offlinePreview";

type ProjectForecast = Project & { forecast: CostForecast | null };
const EMPTY_PROJECTS: ProjectForecast[] = [];

async function loadProjectsWithForecasts(): Promise<ProjectForecast[]> {
  const projects = await api.projects();
  return Promise.all(
    projects.map(async (p) => {
      try {
        const forecast = await api.projectForecast(p.id);
        return { ...p, forecast };
      } catch {
        return { ...p, forecast: null };
      }
    }),
  );
}

function buildOfflineProjectsWithForecasts(): ProjectForecast[] {
  return buildOfflineProjects().map((p) => ({ ...p, forecast: buildOfflineForecast(p.id) }));
}

export default function BudgetPage() {
  const data = useApi(() => withOfflineFallback(loadProjectsWithForecasts, buildOfflineProjectsWithForecasts), []);

  const offline = data.data?.offline ?? false;
  const projects = data.data?.data ?? EMPTY_PROJECTS;

  const totals = useMemo(() => {
    const totalBudget = projects.reduce((s, p) => s + p.budget, 0);
    const totalActual = projects.reduce((s, p) => s + p.actual_cost, 0);
    const totalForecast = projects.reduce((s, p) => s + (p.forecast?.forecasted_final_cost ?? p.budget), 0);
    const variance = totalForecast - totalBudget;
    const burnRate = totalBudget > 0 ? (totalActual / totalBudget) * 100 : 0;
    return { totalBudget, totalActual, totalForecast, variance, burnRate };
  }, [projects]);

  const chartData = projects.map((p) => ({
    name: p.name.length > 16 ? p.name.slice(0, 15) + "…" : p.name,
    Budget: p.budget,
    Actual: p.actual_cost,
    Forecast: p.forecast?.forecasted_final_cost ?? p.budget,
  }));

  const columns: Column<ProjectForecast>[] = [
    {
      key: "name",
      header: "Project",
      sortValue: (p) => p.name,
      render: (p) => (
        <Link href={`/app/projects/${p.id}`} className="font-medium text-text-primary hover:underline">
          {p.name}
        </Link>
      ),
    },
    { key: "budget", header: "Budget", align: "right", sortValue: (p) => p.budget, render: (p) => <span className="font-tabular">{formatCurrency(p.budget)}</span> },
    { key: "actual", header: "Actual", align: "right", sortValue: (p) => p.actual_cost, render: (p) => <span className="font-tabular">{formatCurrency(p.actual_cost)}</span> },
    {
      key: "forecast",
      header: "Forecast (baseline)",
      align: "right",
      sortValue: (p) => p.forecast?.forecasted_final_cost ?? 0,
      render: (p) => <span className="font-tabular">{p.forecast ? formatCurrency(p.forecast.forecasted_final_cost) : "—"}</span>,
    },
    {
      key: "variance",
      header: "Variance",
      align: "right",
      sortValue: (p) => p.forecast?.variance_percent ?? 0,
      render: (p) =>
        p.forecast ? (
          <span className={"font-tabular " + (p.forecast.variance > 0 ? "text-critical-fg" : "text-success-fg")}>
            {p.forecast.variance > 0 ? "+" : ""}
            {formatPercent(p.forecast.variance_percent, 1)}
          </span>
        ) : (
          "—"
        ),
    },
    {
      key: "overrun",
      header: "Overrun Risk",
      align: "right",
      sortValue: (p) => p.forecast?.overrun_probability ?? 0,
      render: (p) => (p.forecast ? <span className="font-tabular">{formatPercent(p.forecast.overrun_probability, 0)}</span> : "—"),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Budget &amp; Financials</h1>
        <p className="mt-1 text-sm text-text-tertiary">Baseline cost forecasts use an EVM formula (EAC = BAC / CPI) — never presented as ML.</p>
      </div>

      {offline && <OfflinePreviewBanner onRetry={data.reload} subject="budget data" />}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Total Budget" value={formatCompactCurrency(totals.totalBudget)} />
        <MetricCard label="Actual Spend" value={formatCompactCurrency(totals.totalActual)} />
        <MetricCard
          label="Forecasted Final Cost"
          value={formatCompactCurrency(totals.totalForecast)}
          delta={totals.variance > 0 ? `+${formatCompactCurrency(totals.variance)} over` : formatCompactCurrency(totals.variance) + " under"}
          deltaTone={totals.variance > 0 ? "critical" : "success"}
          hint="Baseline estimate, portfolio-wide"
        />
        <MetricCard label="Burn Rate" value={formatPercent(totals.burnRate)} hint="Actual spend vs. total budget" />
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Budget vs. Actual vs. Forecast</CardTitle>
            <CardDescription>By project</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {data.loading ? (
            <div className="h-72" />
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--text-tertiary)" }} axisLine={{ stroke: "var(--border-default)" }} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "var(--text-tertiary)" }} axisLine={false} tickLine={false} tickFormatter={(v) => formatCompactCurrency(v)} width={56} />
                  <RTooltip contentStyle={{ background: "var(--bg-surface-raised)", border: "1px solid var(--border-default)", borderRadius: 8, fontSize: 12, color: "var(--text-primary)" }} formatter={(v) => formatCompactCurrency(Number(v))} />
                  <Bar dataKey="Budget" fill="var(--neutral-300)" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Actual" fill="var(--brand-500)" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Forecast" fill="var(--warning-solid)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="mt-3 flex items-center gap-4 text-xs text-text-tertiary">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-neutral-300" /> Budget</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-brand-500" /> Actual</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: "var(--warning-solid)" }} /> Forecast (baseline)</span>
          </div>
        </CardContent>
      </Card>

      <ProgressBar
        value={totals.burnRate}
        showValue
        label="Portfolio burn rate"
        tone={totals.burnRate > 100 ? "critical" : totals.burnRate > 85 ? "warning" : "success"}
      />

      <DataTable columns={columns} rows={projects} loading={data.loading} getRowKey={(p) => p.id} emptyTitle="No projects yet" />
    </div>
  );
}
