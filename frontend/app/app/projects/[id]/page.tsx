"use client";

import { use, useMemo } from "react";
import { Line, LineChart, CartesianGrid, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis, Legend } from "recharts";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Badge, priorityTone, projectStatusTone, riskLevelTone, taskStatusTone } from "@/components/ui/Badge";
import { Tabs } from "@/components/ui/Tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { HealthGauge } from "@/components/ui/StatusIndicator";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/LoadingState";
import { Gantt } from "@/components/viz/Gantt";
import { Timeline } from "@/components/viz/Timeline";
import { RiskMatrix } from "@/components/viz/RiskMatrix";
import { formatCompactCurrency, formatCurrency, formatDate, initials, titleCase } from "@/lib/utils";
import type { Budget, BudgetTransaction, CostForecast, HealthBreakdown, Project, Resource, ResourceAllocation, Risk, Task } from "@/lib/types";

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
                    <span className="font-tabular font-medium text-critical-fg">-{row.value.toFixed(1)}</span>
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
              <p className="font-tabular text-2xl font-semibold text-text-primary">
                {formatCurrency(forecastData.forecasted_final_cost)}
              </p>
              <p className="mt-1 text-xs text-text-tertiary">{forecastData.method}</p>
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-text-tertiary">Variance</dt>
                  <dd className={"font-tabular " + (forecastData.variance > 0 ? "text-critical-fg" : "text-success-fg")}>
                    {formatCurrency(forecastData.variance)} ({forecastData.variance_percent.toFixed(1)}%)
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-text-tertiary">Overrun probability</dt>
                  <dd className="font-tabular text-text-primary">{forecastData.overrun_probability.toFixed(0)}%</dd>
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
          <p className="mt-2 font-tabular text-xl font-semibold text-text-primary">
            {formatCompactCurrency(data.budget.initial_budget, data.budget.currency)}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">Actual Spend</p>
          <p className="mt-2 font-tabular text-xl font-semibold text-text-primary">
            {formatCompactCurrency(data.actual_cost, data.budget.currency)}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">Remaining</p>
          <p className={"mt-2 font-tabular text-xl font-semibold " + (remaining < 0 ? "text-critical-fg" : "text-text-primary")}>
            {formatCompactCurrency(remaining, data.budget.currency)}
          </p>
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
                <LineChart data={trendData}>
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
                  <Line type="monotone" dataKey="Actual" name="Actual to date" stroke="var(--brand-500)" strokeWidth={2} connectNulls={false} dot={{ r: 3 }} isAnimationActive={false} />
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
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-2 text-xs text-text-tertiary">{forecast.method}</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
