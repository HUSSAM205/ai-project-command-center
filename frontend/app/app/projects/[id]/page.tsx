"use client";

import { use, useMemo, useState } from "react";
import { Area, ComposedChart, Line, CartesianGrid, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis, Legend } from "recharts";
import { Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { pmoApi } from "@/lib/api-pmo";
import { useApi } from "@/lib/useApi";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { AISourceBadge, Badge, priorityTone, projectStatusTone, riskLevelTone, taskStatusTone, type SemanticTone } from "@/components/ui/Badge";
import { Tabs } from "@/components/ui/Tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { HealthGauge } from "@/components/ui/StatusIndicator";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/LoadingState";
import { Button } from "@/components/ui/Button";
import { Gantt } from "@/components/viz/Gantt";
import { Timeline } from "@/components/viz/Timeline";
import { RiskMatrix } from "@/components/viz/RiskMatrix";
import { cn, formatCompactCurrency, formatCurrency, formatDate, formatPercent, initials, titleCase } from "@/lib/utils";
import type {
  BoardroomMemo,
  Budget,
  BudgetTransaction,
  ContractLedger,
  CostForecast,
  EVM,
  HealthBreakdown,
  Project,
  RaciEntry,
  Resource,
  ResourceAllocation,
  Risk,
  StageGate,
  Task,
} from "@/lib/types";
import { STAGE_GATE_ORDER } from "@/lib/types";

type TeamRow = ResourceAllocation & { resource?: Resource };
type BudgetData = { budget: Budget; transactions: BudgetTransaction[]; actual_cost: number };

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const project = useApi(() => api.project(id), [id]);
  const tasks = useApi(() => api.tasks(id), [id]);
  const milestones = useApi(() => api.milestones(id), [id]);
  const risks = useApi(() => api.risks(id), [id]);
  const health = useApi(() => api.projectHealth(id), [id]);
  const forecast = useApi(() => api.projectForecast(id), [id]);
  const budget = useApi(() => api.budget(id), [id]);
  const allocations = useApi(() => api.allocations(id), [id]);
  const resources = useApi(() => api.resources(), []);

  const team = useMemo<TeamRow[]>(() => {
    if (!allocations.data || !resources.data) return [];
    return allocations.data.map((a) => ({
      ...a,
      resource: resources.data!.find((r) => r.id === a.resource_id),
    }));
  }, [allocations.data, resources.data]);

  if (project.loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (project.error || !project.data) {
    return (
      <ErrorState
        title="Couldn't load this project"
        description={project.error?.message}
        offline={project.error?.message?.includes("offline")}
        onRetry={project.reload}
      />
    );
  }

  const p = project.data;

  const taskColumns: Column<Task>[] = [
    { key: "title", header: "Task", sortValue: (t) => t.title, render: (t) => <span className="font-medium text-text-primary">{t.title}</span> },
    { key: "status", header: "Status", sortValue: (t) => t.status, render: (t) => <Badge tone={taskStatusTone(t.status)}>{titleCase(t.status)}</Badge> },
    { key: "priority", header: "Priority", sortValue: (t) => t.priority, render: (t) => <Badge tone={priorityTone(t.priority)}>{titleCase(t.priority)}</Badge> },
    { key: "assignee", header: "Assignee", render: (t) => t.assignee_name ?? <span className="text-text-tertiary">Unassigned</span> },
    { key: "due", header: "Due", align: "right", sortValue: (t) => t.due_date ?? "", render: (t) => <span className="font-tabular">{formatDate(t.due_date)}</span> },
    {
      key: "completion",
      header: "Progress",
      align: "right",
      sortValue: (t) => t.completion_percentage,
      render: (t) => <span className="font-tabular">{t.completion_percentage}%</span>,
    },
  ];

  const riskColumns: Column<Risk>[] = [
    { key: "title", header: "Risk", sortValue: (r) => r.title, render: (r) => <span className="font-medium text-text-primary">{r.title}</span> },
    { key: "category", header: "Category", sortValue: (r) => r.category, render: (r) => titleCase(r.category) },
    { key: "score", header: "Score", align: "right", sortValue: (r) => r.score, render: (r) => <span className="font-tabular">{r.probability} × {r.impact} = {r.score}</span> },
    { key: "severity", header: "Severity", sortValue: (r) => r.score, render: (r) => <Badge tone={riskLevelTone(r.severity)}>{r.severity}</Badge> },
    { key: "owner", header: "Owner", render: (r) => r.owner ?? "—" },
    { key: "status", header: "Status", sortValue: (r) => r.status, render: (r) => titleCase(r.status) },
  ];

  const teamColumns: Column<TeamRow>[] = [
    {
      key: "name",
      header: "Resource",
      render: (a) => (
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-100 text-[10px] font-semibold text-brand-700 dark:bg-brand-800 dark:text-brand-200">
            {initials(a.resource?.name)}
          </span>
          <div>
            <p className="font-medium text-text-primary">{a.resource?.name ?? "—"}</p>
            <p className="text-xs text-text-tertiary">{a.resource?.role}</p>
          </div>
        </div>
      ),
    },
    { key: "allocation", header: "Allocation", align: "right", sortValue: (a) => a.allocation_percent, render: (a) => <span className="font-tabular">{a.allocation_percent}%</span> },
    { key: "dates", header: "Period", align: "right", render: (a) => <span className="font-tabular">{formatDate(a.start_date)} – {formatDate(a.end_date)}</span> },
  ];

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "Projects", href: "/app/projects" }, { label: p.name }]} />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">{p.name}</h1>
          <p className="mt-1 text-sm text-text-tertiary">{p.client ?? "Internal"} · {formatDate(p.start_date)} – {formatDate(p.end_date)}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={projectStatusTone(p.status)}>{titleCase(p.status)}</Badge>
          <Badge tone={priorityTone(p.priority)}>{titleCase(p.priority)} priority</Badge>
          <Badge tone={riskLevelTone(p.risk_level)}>{p.risk_level} risk</Badge>
        </div>
      </div>

      <Tabs
        tabs={[
          {
            id: "overview",
            label: "Overview",
            content: (
              <OverviewTab
                project={p}
                healthLoading={health.loading}
                healthData={health.data}
                forecastLoading={forecast.loading}
                forecastData={forecast.data}
              />
            ),
          },
          {
            id: "timeline",
            label: "Timeline",
            content: tasks.loading || milestones.loading ? (
              <Spinner />
            ) : (
              <Gantt tasks={tasks.data ?? []} milestones={milestones.data ?? []} />
            ),
          },
          {
            id: "tasks",
            label: "Tasks",
            content: tasks.error ? (
              <ErrorState description={tasks.error.message} onRetry={tasks.reload} />
            ) : (
              <DataTable columns={taskColumns} rows={tasks.data ?? []} loading={tasks.loading} getRowKey={(t) => t.id} emptyTitle="No tasks yet" />
            ),
          },
          {
            id: "milestones",
            label: "Milestones",
            content: milestones.loading ? <Spinner /> : <Timeline milestones={milestones.data ?? []} />,
          },
          {
            id: "team",
            label: "Team",
            content: (
              <DataTable columns={teamColumns} rows={team} loading={allocations.loading || resources.loading} getRowKey={(a) => a.id} emptyTitle="No team allocations yet" />
            ),
          },
          {
            id: "budget",
            label: "Budget",
            content: (
              <BudgetTab
                loading={budget.loading}
                error={budget.error}
                data={budget.data}
                onRetry={budget.reload}
                project={p}
                forecast={forecast.data}
                forecastLoading={forecast.loading}
              />
            ),
          },
          {
            id: "risks",
            label: "Risks",
            content: risks.loading ? (
              <Spinner />
            ) : (risks.data ?? []).length === 0 ? (
              <EmptyState title="No risks logged" />
            ) : (
              <div className="space-y-6">
                <RiskMatrix risks={risks.data ?? []} />
                <DataTable columns={riskColumns} rows={risks.data ?? []} getRowKey={(r) => r.id} emptyTitle="No risks logged" />
              </div>
            ),
          },
          {
            id: "pmo",
            label: "PMO",
            content: <PMOTab projectId={id} projectName={p.name} />,
          },
        ]}
      />
    </div>
  );
}

function OverviewTab({
  project,
  healthLoading,
  healthData,
  forecastLoading,
  forecastData,
}: {
  project: Project;
  healthLoading: boolean;
  healthData: HealthBreakdown | null;
  forecastLoading: boolean;
  forecastData: CostForecast | null;
}) {
  const breakdownRows = healthData
    ? [
        { label: "Schedule", value: healthData.schedule_penalty },
        { label: "Budget", value: healthData.budget_penalty },
        { label: "Task completion", value: healthData.task_penalty },
        { label: "Risk", value: healthData.risk_penalty },
        { label: "Resource", value: healthData.resource_penalty },
        { label: "Dependency", value: healthData.dependency_penalty },
      ]
    : [];

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle>Health Score</CardTitle>
          <CardDescription>Penalty breakdown from 100</CardDescription>
        </CardHeader>
        <CardContent>
          {healthLoading ? (
            <Spinner />
          ) : healthData ? (
            <div className="flex items-center gap-4">
              <HealthGauge score={healthData.health_score} size={72} />
              <ul className="flex-1 space-y-1.5 text-xs">
                {breakdownRows.map((row) => (
                  <li key={row.label} className="flex items-center justify-between">
                    <span className="text-text-secondary">{row.label}</span>
                    <span className="font-tabular font-medium text-critical-fg">
                      -<AnimatedNumber value={row.value} format={(n) => n.toFixed(1)} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-text-tertiary">Health data unavailable.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Progress</CardTitle>
          <CardDescription>Overall completion</CardDescription>
        </CardHeader>
        <CardContent>
          <ProgressBar value={project.progress} showValue tone="info" />
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-text-tertiary">Manager</dt>
              <dd className="text-text-primary">{project.manager_name ?? "Unassigned"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-text-tertiary">Start</dt>
              <dd className="font-tabular text-text-primary">{formatDate(project.start_date)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-text-tertiary">End</dt>
              <dd className="font-tabular text-text-primary">{formatDate(project.end_date)}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cost Forecast</CardTitle>
          <CardDescription>Baseline estimate (EVM)</CardDescription>
        </CardHeader>
        <CardContent>
          {forecastLoading ? (
            <Spinner />
          ) : forecastData ? (
            <>
              <AnimatedNumber
                value={forecastData.forecasted_final_cost}
                format={(n) => formatCurrency(n)}
                className="text-2xl font-semibold text-text-primary"
              />
              <p className="mt-1 text-xs text-text-tertiary">{forecastData.method}</p>
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-text-tertiary">Variance</dt>
                  <dd className={"font-tabular " + (forecastData.variance > 0 ? "text-critical-fg" : "text-success-fg")}>
                    <AnimatedNumber value={forecastData.variance} format={(n) => formatCurrency(n)} /> (
                    <AnimatedNumber value={forecastData.variance_percent} format={(n) => `${n.toFixed(1)}%`} />)
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-text-tertiary">Overrun probability</dt>
                  <dd>
                    <AnimatedNumber value={forecastData.overrun_probability} format={(n) => `${n.toFixed(0)}%`} className="text-text-primary" />
                  </dd>
                </div>
              </dl>
            </>
          ) : (
            <p className="text-sm text-text-tertiary">Forecast unavailable.</p>
          )}
        </CardContent>
      </Card>

      {project.description && (
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Description</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-text-secondary">{project.description}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function BudgetTab({
  loading,
  error,
  data,
  onRetry,
  project,
  forecast,
  forecastLoading,
}: {
  loading: boolean;
  error: Error | null;
  data: BudgetData | null;
  onRetry: () => void;
  project: Project;
  forecast: CostForecast | null;
  forecastLoading: boolean;
}) {
  if (loading) return <Spinner />;
  if (error) return <ErrorState description={error.message} onRetry={onRetry} />;
  if (!data) return <EmptyState title="No budget set up yet" />;

  const remaining = data.budget.initial_budget - data.actual_cost;
  const utilization = data.budget.initial_budget > 0 ? (data.actual_cost / data.budget.initial_budget) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">Initial Budget</p>
          <AnimatedNumber
            value={data.budget.initial_budget}
            format={(n) => formatCompactCurrency(n, data.budget.currency)}
            className="mt-2 block text-xl font-semibold text-text-primary"
          />
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">Actual Spend</p>
          <AnimatedNumber
            value={data.actual_cost}
            format={(n) => formatCompactCurrency(n, data.budget.currency)}
            className="mt-2 block text-xl font-semibold text-text-primary"
          />
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">Remaining</p>
          <AnimatedNumber
            value={remaining}
            format={(n) => formatCompactCurrency(n, data.budget.currency)}
            className={"mt-2 block text-xl font-semibold " + (remaining < 0 ? "text-critical-fg" : "text-text-primary")}
          />
        </Card>
      </div>
      <ProgressBar value={utilization} showValue label="Budget utilization" tone={utilization > 100 ? "critical" : utilization > 85 ? "warning" : "success"} />

      <BudgetTrendChart project={project} forecast={forecast} loading={forecastLoading} currency={data.budget.currency} />

      <div>
        <h3 className="mb-2 text-sm font-semibold text-text-primary">Transactions</h3>
        {data.transactions.length === 0 ? (
          <EmptyState title="No transactions recorded" />
        ) : (
          <ul className="divide-y divide-border-default rounded-lg border border-border-default bg-surface">
            {data.transactions.map((t) => (
              <li key={t.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <div>
                  <p className="font-medium text-text-primary">{t.description}</p>
                  <p className="text-xs text-text-tertiary">{t.category} · {formatDate(t.date)}</p>
                </div>
                <span className="font-tabular font-medium text-text-primary">{formatCurrency(t.amount, data.budget.currency)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * Simple 3-point trend — Start / Today / Projected End — showing budget as a flat reference
 * against actual cost-to-date and the EVM baseline forecast. Explicitly labeled a baseline
 * estimate; never implies a predictive/ML model.
 */
function BudgetTrendChart({
  project,
  forecast,
  loading,
  currency,
}: {
  project: Project;
  forecast: CostForecast | null;
  loading: boolean;
  currency: string;
}) {
  const trendData = useMemo(() => {
    if (!forecast) return [];
    const todayLabel = "Today";
    const endLabel = formatDate(project.end_date);
    const startLabel = formatDate(project.start_date);
    return [
      { label: startLabel, Budget: project.budget, Actual: 0, Forecast: null as number | null },
      { label: todayLabel, Budget: project.budget, Actual: project.actual_cost, Forecast: project.actual_cost },
      { label: endLabel, Budget: project.budget, Actual: null as number | null, Forecast: forecast.forecasted_final_cost },
    ];
  }, [project, forecast]);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Cost Trend</CardTitle>
          <CardDescription>Budget vs. actual-to-date vs. baseline estimate (EVM) — not a predictive model</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-56 flex items-center justify-center">
            <Spinner />
          </div>
        ) : !forecast || trendData.length === 0 ? (
          <EmptyState title="Forecast unavailable" description="Not enough data to plot a cost trend yet." />
        ) : (
          <>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                {/* Actual-to-date gets a gradient fill (a real trend series) while Budget/Forecast
                    stay dashed reference lines — an area chart only earns its place for the one
                    series that's genuinely a cumulative-to-date read, not the flat/baseline ones. */}
                <ComposedChart data={trendData}>
                  <defs>
                    <linearGradient id="costTrendFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--brand-500)" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="var(--brand-500)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--text-tertiary)" }} axisLine={{ stroke: "var(--border-default)" }} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 11, fill: "var(--text-tertiary)" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => formatCompactCurrency(v, currency)}
                    width={56}
                  />
                  <RTooltip
                    contentStyle={{ background: "var(--bg-surface-raised)", border: "1px solid var(--border-default)", borderRadius: 8, fontSize: 12, color: "var(--text-primary)" }}
                    formatter={(v) => formatCompactCurrency(Number(v), currency)}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="Budget" stroke="var(--neutral-400)" strokeDasharray="4 4" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                  <Area
                    type="monotone"
                    dataKey="Actual"
                    name="Actual to date"
                    stroke="var(--brand-500)"
                    fill="url(#costTrendFill)"
                    strokeWidth={2}
                    connectNulls={false}
                    dot={{ r: 3 }}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="Forecast"
                    name="Baseline estimate"
                    stroke="var(--warning-solid)"
                    strokeDasharray="5 3"
                    strokeWidth={2}
                    connectNulls={false}
                    dot={{ r: 3 }}
                    isAnimationActive={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-2 text-xs text-text-tertiary">{forecast.method}</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Advanced PMO engines: EVM, RACI matrix, stage gates, contract ledger / margin leakage, and
 * the boardroom memo generator (backend app/api/pmo.py). Each sub-panel fetches independently
 * so one slow/erroring engine never blocks the others. EVM/contract-ledger numbers are shown
 * with `font-tabular`, matching this app's existing "monospaced executive readout" convention
 * (see the Cost Forecast card above and frontend/app/globals.css's font-tabular usage).
 */
function PMOTab({ projectId, projectName }: { projectId: string; projectName: string }) {
  const evm = useApi(() => pmoApi.evm(projectId), [projectId]);
  const raci = useApi(() => pmoApi.raci(projectId), [projectId]);
  const stageGates = useApi(() => pmoApi.stageGates(projectId), [projectId]);
  const contractLedger = useApi(() => pmoApi.contractLedger(projectId), [projectId]);

  return (
    <div className="space-y-6">
      <EVMCard loading={evm.loading} error={evm.error} data={evm.data} onRetry={evm.reload} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ContractLedgerCard loading={contractLedger.loading} error={contractLedger.error} data={contractLedger.data} onRetry={contractLedger.reload} />
        <StageGatesCard loading={stageGates.loading} error={stageGates.error} data={stageGates.data} onRetry={stageGates.reload} />
      </div>
      <RaciCard loading={raci.loading} error={raci.error} data={raci.data} onRetry={raci.reload} />
      <BoardroomMemoCard projectId={projectId} projectName={projectName} />
    </div>
  );
}

function evmAnomalyTone(level: string): SemanticTone {
  return level === "critical" ? "critical" : level === "warning" ? "warning" : "neutral";
}

function EVMCard({
  loading,
  error,
  data,
  onRetry,
}: {
  loading: boolean;
  error: Error | null;
  data: EVM | null;
  onRetry: () => void;
}) {
  const stats: { label: string; value: number | null; format: (n: number) => string; hint?: string }[] = data
    ? [
        { label: "PV", value: data.pv, format: (n) => formatCurrency(n), hint: "Planned Value" },
        { label: "EV", value: data.ev, format: (n) => formatCurrency(n), hint: "Earned Value" },
        { label: "AC", value: data.ac, format: (n) => formatCurrency(n), hint: "Actual Cost" },
        { label: "CPI", value: data.cpi, format: (n) => n.toFixed(2), hint: "Cost Performance Index" },
        { label: "SPI", value: data.spi, format: (n) => n.toFixed(2), hint: "Schedule Performance Index" },
        { label: "EAC", value: data.eac, format: (n) => formatCurrency(n), hint: "Estimate At Completion" },
        { label: "VAC", value: data.vac, format: (n) => formatCurrency(n), hint: "Variance At Completion" },
      ]
    : [];

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Earned Value Management</CardTitle>
          <CardDescription>{data ? data.method : "Deterministic EVM baseline — PV / EV / AC / CPI / SPI / EAC / VAC"}</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Spinner />
        ) : error ? (
          <ErrorState description={error.message} onRetry={onRetry} />
        ) : !data ? (
          <EmptyState title="EVM data unavailable" />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
              {stats.map((s) => (
                <div key={s.label}>
                  <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">{s.label}</p>
                  <p
                    className={cn(
                      "mt-1 text-lg font-semibold",
                      s.label === "VAC" ? (data.vac < 0 ? "text-critical-fg" : "text-success-fg") : "text-text-primary",
                    )}
                  >
                    {s.value !== null ? <AnimatedNumber value={s.value} format={s.format} /> : "—"}
                  </p>
                  {s.hint && <p className="mt-0.5 text-[11px] text-text-tertiary">{s.hint}</p>}
                </div>
              ))}
            </div>
            {data.anomalies.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2 border-t border-border-default pt-4">
                {data.anomalies.map((a) => (
                  <Badge key={a.metric} tone={evmAnomalyTone(a.level)} dot>
                    {a.message}
                  </Badge>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ContractLedgerCard({
  loading,
  error,
  data,
  onRetry,
}: {
  loading: boolean;
  error: Error | null;
  data: ContractLedger | null;
  onRetry: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Contract Ledger</CardTitle>
          <CardDescription>Total contract value, billing, and margin leakage</CardDescription>
        </div>
        {data && data.scope_creep_flag && (
          <Badge tone="critical" dot>
            Scope creep signal
          </Badge>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <Spinner />
        ) : error ? (
          <ErrorState description={error.message} onRetry={onRetry} />
        ) : !data ? (
          <EmptyState title="No contract ledger set up yet" />
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">TCV</p>
                <AnimatedNumber
                  value={data.total_contract_value}
                  format={(n) => formatCompactCurrency(n, data.currency)}
                  className="mt-1 block text-lg font-semibold text-text-primary"
                />
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">Billed</p>
                <AnimatedNumber
                  value={data.billed_to_date}
                  format={(n) => formatCompactCurrency(n, data.currency)}
                  className="mt-1 block text-lg font-semibold text-text-primary"
                />
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">WIP</p>
                <AnimatedNumber
                  value={data.wip}
                  format={(n) => formatCompactCurrency(n, data.currency)}
                  className="mt-1 block text-lg font-semibold text-text-primary"
                />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-md border border-border-default bg-subtle/50 px-3.5 py-3">
              <div className="flex items-center gap-2">
                {data.margin_leakage_pct > 0 ? (
                  <TrendingDown className="h-4 w-4 text-critical-fg" aria-hidden="true" />
                ) : (
                  <TrendingUp className="h-4 w-4 text-success-fg" aria-hidden="true" />
                )}
                <span className="text-sm text-text-secondary">Margin leakage</span>
              </div>
              <AnimatedNumber
                value={data.margin_leakage_pct}
                format={(n) => formatPercent(n, 1)}
                className={cn("text-lg font-semibold", data.margin_leakage_pct > 0 ? "text-critical-fg" : "text-success-fg")}
              />
            </div>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-text-tertiary">Planned margin</dt>
                <dd><AnimatedNumber value={data.planned_margin_pct} format={(n) => formatPercent(n, 1)} className="text-text-primary" /></dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-text-tertiary">Current margin</dt>
                <dd><AnimatedNumber value={data.current_margin_pct} format={(n) => formatPercent(n, 1)} className="text-text-primary" /></dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-text-tertiary">Billing gap</dt>
                <dd className={cn(data.billing_gap > 0 ? "text-warning-fg" : "text-text-primary")}>
                  <AnimatedNumber value={data.billing_gap} format={(n) => formatCurrency(n, data.currency)} />
                </dd>
              </div>
            </dl>
          </div>
        )}
      </CardContent>
    </Card>
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

function StageGatesCard({
  loading,
  error,
  data,
  onRetry,
}: {
  loading: boolean;
  error: Error | null;
  data: StageGate[] | null;
  onRetry: () => void;
}) {
  const byGate = new Map((data ?? []).map((g) => [g.gate, g]));

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Stage Gates</CardTitle>
          <CardDescription>Steering committee sign-off, G1 through G5</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Spinner />
        ) : error ? (
          <ErrorState description={error.message} onRetry={onRetry} />
        ) : (data ?? []).length === 0 ? (
          <EmptyState title="No stage gates defined yet" />
        ) : (
          <ol className="space-y-2.5">
            {STAGE_GATE_ORDER.filter((g) => byGate.has(g)).map((g) => {
              const gate = byGate.get(g)!;
              return (
                <li key={gate.id} className="flex items-start gap-3 rounded-md border border-border-default px-3.5 py-2.5">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-subtle font-tabular text-xs font-semibold text-text-secondary">
                    {gate.gate}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-text-primary">{gate.name}</p>
                      <Badge tone={stageGateStatusTone(gate.status)}>{titleCase(gate.status)}</Badge>
                    </div>
                    {gate.signed_off_at ? (
                      <p className="mt-0.5 text-xs text-text-tertiary">
                        Signed off {formatDate(gate.signed_off_at)}
                        {gate.approver ? ` by ${gate.approver}` : ""}
                      </p>
                    ) : gate.approver ? (
                      <p className="mt-0.5 text-xs text-text-tertiary">Approver: {gate.approver}</p>
                    ) : null}
                    {gate.notes && <p className="mt-1 text-xs text-text-secondary">{gate.notes}</p>}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function RaciCard({
  loading,
  error,
  data,
  onRetry,
}: {
  loading: boolean;
  error: Error | null;
  data: RaciEntry[] | null;
  onRetry: () => void;
}) {
  const columns: Column<RaciEntry>[] = [
    { key: "task", header: "Task / Deliverable", render: (r) => <span className="font-medium text-text-primary">{r.task_or_deliverable}</span> },
    { key: "responsible", header: "Responsible", render: (r) => r.responsible_name ?? <span className="text-text-tertiary">—</span> },
    { key: "accountable", header: "Accountable", render: (r) => r.accountable_name ?? <span className="text-text-tertiary">—</span> },
    { key: "consulted", header: "Consulted", render: (r) => r.consulted_name ?? <span className="text-text-tertiary">—</span> },
    { key: "informed", header: "Informed", render: (r) => r.informed_name ?? <span className="text-text-tertiary">—</span> },
  ];

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>RACI Matrix</CardTitle>
          <CardDescription>Responsible, Accountable, Consulted, Informed by deliverable</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {error ? (
          <ErrorState description={error.message} onRetry={onRetry} />
        ) : (
          <DataTable columns={columns} rows={data ?? []} loading={loading} getRowKey={(r) => r.id} emptyTitle="No RACI entries yet" />
        )}
      </CardContent>
    </Card>
  );
}

function BoardroomMemoCard({ projectId, projectName }: { projectId: string; projectName: string }) {
  const [memo, setMemo] = useState<BoardroomMemo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const result = await pmoApi.generateBoardroomMemo(projectId);
      setMemo(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to generate the boardroom memo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Boardroom Memo</CardTitle>
          <CardDescription>Steering-committee brief with 3 computed trade-off options for {projectName}</CardDescription>
        </div>
        <Button onClick={generate} loading={loading} disabled={loading} size="sm">
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          Generate Boardroom Memo
        </Button>
      </CardHeader>
      <CardContent>
        {error && <ErrorState description={error} onRetry={generate} />}
        {!error && !memo && !loading && (
          <EmptyState title="No memo generated yet" description="Click Generate Boardroom Memo to produce a fresh brief from this project's live EVM and contract data." />
        )}
        {loading && !memo && (
          <div className="flex items-center justify-center py-10">
            <Spinner />
          </div>
        )}
        {memo && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border-default pb-4">
              <div>
                <p className="text-sm text-text-secondary">{memo.narrative.summary}</p>
                <p className="mt-1 text-xs text-text-tertiary">Generated {formatDate(memo.generated_at)}</p>
              </div>
              <AISourceBadge source={memo.narrative.source} />
            </div>
            {memo.narrative.detail && (
              <p className="whitespace-pre-line text-sm leading-relaxed text-text-secondary">{memo.narrative.detail}</p>
            )}
            <div>
              <h4 className="mb-3 text-sm font-semibold text-text-primary">Trade-off Options</h4>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                {memo.options.map((opt) => (
                  <div key={opt.key} className="rounded-lg border border-border-default p-4">
                    <p className="text-sm font-semibold text-text-primary">{opt.title}</p>
                    <p className="mt-1 text-xs text-text-secondary">{opt.description}</p>
                    <div className="mt-3 space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-text-tertiary">New forecast</span>
                        <span className="font-tabular font-medium text-text-primary">{formatCurrency(opt.new_forecast_cost)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-text-tertiary">vs. budget</span>
                        <span className={cn("font-tabular font-medium", opt.variance_vs_budget > 0 ? "text-critical-fg" : "text-success-fg")}>
                          {opt.variance_vs_budget > 0 ? "+" : ""}
                          {formatCurrency(opt.variance_vs_budget)}
                        </span>
                      </div>
                    </div>
                    <ul className="mt-3 space-y-1 border-t border-border-default pt-2.5">
                      {opt.assumptions.map((a, i) => (
                        <li key={i} className="text-[11px] text-text-tertiary">
                          • {a}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
