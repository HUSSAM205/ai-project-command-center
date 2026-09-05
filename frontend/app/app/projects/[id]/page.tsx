"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  Bar,
  ComposedChart,
  Line,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import { Dices, LayoutGrid, List, Plus, SquarePen, Sparkles, Trash2, TrendingDown, TrendingUp } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { pmoApi } from "@/lib/api-pmo";
import { useApi } from "@/lib/useApi";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/ui/Toast";
import { PMO_COMMAND_EVENT, type PmoCommandDetail } from "@/lib/commands";
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
import { TypewriterText } from "@/components/ui/TypewriterText";
import { TaskFormModal } from "@/components/forms/TaskFormModal";
import { RiskFormModal } from "@/components/forms/RiskFormModal";
import { Gantt } from "@/components/viz/Gantt";
import { Kanban } from "@/components/viz/Kanban";
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
  TaskStatus,
  WhatIfResult,
} from "@/lib/types";
import { STAGE_GATE_ORDER } from "@/lib/types";

type TeamRow = ResourceAllocation & { resource?: Resource };
type BudgetData = { budget: Budget; transactions: BudgetTransaction[]; actual_cost: number };

// Hoisted to module scope (same pattern as NAV_ITEMS in app/app/layout.tsx): these don't close over
// any component state, so defining them inline in the component body just recreated a fresh array +
// fresh render/sortValue closures on every render — including on state changes unrelated to these
// tabs (any of this page's ~9 independent useApi hooks resolving). That broke DataTable's internal
// `sorted` useMemo (it depended on `columns` by reference) every single time, forcing a pointless
// re-sort. Module scope makes the reference stable for real, on top of the DataTable-level fix below.
// (Task/Risk columns moved to a component-level useMemo below — their actions column closes over
// the delete/edit handlers, so they can no longer live at module scope.)
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
  // PMO engines (Task 3 perf fix): these used to be fetched inside PMOTab itself, which only mounts
  // while the "pmo" tab is active — `Tabs` fully unmounts inactive tab content (see components/ui/
  // Tabs.tsx's AnimatePresence), so every trip away from and back to the PMO tab re-issued all four
  // of these requests even though nothing had changed. Fetching them here, alongside every other tab's
  // data (tasks/milestones/risks/health/... above), fetches each once per project visit and keeps it
  // cached across tab switches — matching how every other tab on this page already behaves.
  const evm = useApi(() => pmoApi.evm(id), [id]);
  const raci = useApi(() => pmoApi.raci(id), [id]);
  const stageGates = useApi(() => pmoApi.stageGates(id), [id]);
  const contractLedger = useApi(() => pmoApi.contractLedger(id), [id]);

  const team = useMemo<TeamRow[]>(() => {
    if (!allocations.data || !resources.data) return [];
    return allocations.data.map((a) => ({
      ...a,
      resource: resources.data!.find((r) => r.id === a.resource_id),
    }));
  }, [allocations.data, resources.data]);

  const { push } = useToast();
  const { isDemo } = useAuth();

  // Local overrides layered on top of tasks.reload()/risks.reload() so create/edit/delete update
  // the on-screen table and RiskMatrix instantly (no DataTable skeleton flash). Health/forecast
  // aren't overridden the same way — those are real server-computed EVM/health formulas (see
  // app/services/health_score.py, cost_forecast.py); reloading them for real after a mutation is
  // what "instant reactivity" honestly means here, rather than re-deriving the same math client-side
  // and risking it drifting from the backend's numbers.
  const [localTasks, setLocalTasks] = useState<Task[] | null>(null);
  const [localRisks, setLocalRisks] = useState<Risk[] | null>(null);
  const [taskView, setTaskView] = useState<"table" | "kanban">("table");
  const [taskFormOpen, setTaskFormOpen] = useState(false);
  const [riskFormOpen, setRiskFormOpen] = useState(false);
  const [editingRisk, setEditingRisk] = useState<Risk | null>(null);
  const taskRows = localTasks ?? tasks.data ?? [];
  const riskRows = localRisks ?? risks.data ?? [];

  const handleTaskCreated = useCallback(
    (task: Task, simulated: boolean) => {
      setLocalTasks([task, ...(localTasks ?? tasks.data ?? [])]);
      push(simulated ? "Task created — sandbox only, not saved" : "Task created", "success");
      if (!simulated) {
        health.reload();
        forecast.reload();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload()/push are stable; localTasks/tasks.data read fresh via closure on each open
    [tasks.data, localTasks],
  );

  const handleTaskDelete = useCallback(
    async (task: Task) => {
      if (!window.confirm(`Delete "${task.title}"? This can't be undone.`)) return;
      const prev = taskRows;
      setLocalTasks(prev.filter((t) => t.id !== task.id));
      if (isDemo) {
        push("Deleted — sandbox only, not saved", "success");
        return;
      }
      try {
        await api.deleteTask(task.id);
        push("Task deleted", "success");
        health.reload();
        forecast.reload();
      } catch (err) {
        setLocalTasks(prev);
        push(err instanceof Error ? err.message : "Could not delete the task", "error");
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [taskRows, isDemo],
  );

  const handleTaskStatusChange = useCallback(
    async (taskId: string, newStatus: TaskStatus) => {
      const prev = taskRows;
      setLocalTasks(prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)));
      if (isDemo) {
        push("Status updated — sandbox only, not saved", "success");
        return;
      }
      try {
        await api.updateTask(taskId, { status: newStatus });
        push("Task status updated", "success");
        health.reload();
        forecast.reload();
      } catch (err) {
        setLocalTasks(prev);
        push(err instanceof Error ? err.message : "Could not update task status", "error");
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [taskRows, isDemo],
  );

  const handleRiskSaved = useCallback(
    (risk: Risk, simulated: boolean) => {
      const rows = localRisks ?? risks.data ?? [];
      const exists = rows.some((r) => r.id === risk.id);
      setLocalRisks(exists ? rows.map((r) => (r.id === risk.id ? risk : r)) : [risk, ...rows]);
      const verb = exists ? "updated" : "added";
      push(simulated ? `Risk ${verb} — sandbox only, not saved` : `Risk ${verb}`, "success");
      if (!simulated) health.reload();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [risks.data, localRisks],
  );

  const handleRiskDelete = useCallback(
    async (risk: Risk) => {
      if (!window.confirm(`Delete "${risk.title}"? This can't be undone.`)) return;
      const prev = riskRows;
      setLocalRisks(prev.filter((r) => r.id !== risk.id));
      if (isDemo) {
        push("Deleted — sandbox only, not saved", "success");
        return;
      }
      try {
        await api.deleteRisk(risk.id);
        push("Risk deleted", "success");
        health.reload();
      } catch (err) {
        setLocalRisks(prev);
        push(err instanceof Error ? err.message : "Could not delete the risk", "error");
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [riskRows, isDemo],
  );

  const taskColumns = useMemo<Column<Task>[]>(
    () => [
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
      {
        key: "actions",
        header: "",
        align: "right",
        width: "48px",
        render: (t) => (
          <Button variant="ghost" size="icon" aria-label={`Delete ${t.title}`} onClick={() => handleTaskDelete(t)}>
            <Trash2 className="h-4 w-4 text-text-tertiary" />
          </Button>
        ),
      },
    ],
    [handleTaskDelete],
  );

  const riskColumns = useMemo<Column<Risk>[]>(
    () => [
      { key: "title", header: "Risk", sortValue: (r) => r.title, render: (r) => <span className="font-medium text-text-primary">{r.title}</span> },
      { key: "category", header: "Category", sortValue: (r) => r.category, render: (r) => titleCase(r.category) },
      { key: "score", header: "Score", align: "right", sortValue: (r) => r.score, render: (r) => <span className="font-tabular">{r.probability} × {r.impact} = {r.score}</span> },
      { key: "severity", header: "Severity", sortValue: (r) => r.score, render: (r) => <Badge tone={riskLevelTone(r.severity)}>{r.severity}</Badge> },
      { key: "owner", header: "Owner", render: (r) => r.owner ?? "—" },
      { key: "status", header: "Status", sortValue: (r) => r.status, render: (r) => titleCase(r.status) },
      {
        key: "actions",
        header: "",
        align: "right",
        width: "84px",
        render: (r) => (
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Edit ${r.title}`}
              onClick={() => {
                setEditingRisk(r);
                setRiskFormOpen(true);
              }}
            >
              <SquarePen className="h-4 w-4 text-text-tertiary" />
            </Button>
            <Button variant="ghost" size="icon" aria-label={`Delete ${r.title}`} onClick={() => handleRiskDelete(r)}>
              <Trash2 className="h-4 w-4 text-text-tertiary" />
            </Button>
          </div>
        ),
      },
    ],
    [handleRiskDelete],
  );

  // Command-bar action commands (lib/commands.ts's PMO_COMMAND_EVENT — "Generate Boardroom Memo
  // for this project" / "Run Monte Carlo Simulation for this project") need to (1) switch to the
  // PMO tab, since that's where both live and Tabs only mounts the active tab's content, and (2)
  // tell the freshly-mounted card to actually fire its real action. `pmoAutoAction` carries a
  // fresh object (not just the action string) so a repeat command for the same action still
  // re-triggers the consuming card's effect even though the string value didn't change.
  const [activeTab, setActiveTab] = useState("overview");
  const [pmoAutoAction, setPmoAutoAction] = useState<{ action: PmoCommandDetail["action"]; nonce: number } | null>(null);

  useEffect(() => {
    function onPmoCommand(e: Event) {
      const detail = (e as CustomEvent<PmoCommandDetail>).detail;
      if (!detail || detail.projectId !== id) return;
      setActiveTab("pmo");
      setPmoAutoAction({ action: detail.action, nonce: Date.now() });
    }
    window.addEventListener(PMO_COMMAND_EVENT, onPmoCommand);
    return () => window.removeEventListener(PMO_COMMAND_EVENT, onPmoCommand);
  }, [id]);

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
        value={activeTab}
        onChange={setActiveTab}
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
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-1 rounded-md border border-border-default p-0.5">
                    <Button variant={taskView === "table" ? "secondary" : "ghost"} size="sm" onClick={() => setTaskView("table")} aria-pressed={taskView === "table"}>
                      <List className="h-4 w-4" /> WBS Table
                    </Button>
                    <Button variant={taskView === "kanban" ? "secondary" : "ghost"} size="sm" onClick={() => setTaskView("kanban")} aria-pressed={taskView === "kanban"}>
                      <LayoutGrid className="h-4 w-4" /> Kanban
                    </Button>
                  </div>
                  <Button size="sm" onClick={() => setTaskFormOpen(true)}>
                    <Plus className="h-4 w-4" /> New task
                  </Button>
                </div>
                {taskView === "table" ? (
                  <DataTable columns={taskColumns} rows={taskRows} loading={tasks.loading && localTasks === null} getRowKey={(t) => t.id} emptyTitle="No tasks yet" />
                ) : (
                  <Kanban tasks={taskRows} onStatusChange={handleTaskStatusChange} readOnly={isDemo} />
                )}
              </div>
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
            content: (
              <div className="space-y-4">
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    onClick={() => {
                      setEditingRisk(null);
                      setRiskFormOpen(true);
                    }}
                  >
                    <Plus className="h-4 w-4" /> Add risk
                  </Button>
                </div>
                {risks.loading && localRisks === null ? (
                  <Spinner />
                ) : riskRows.length === 0 ? (
                  <EmptyState title="No risks logged" />
                ) : (
                  <div className="space-y-6">
                    <RiskMatrix risks={riskRows} />
                    <DataTable columns={riskColumns} rows={riskRows} getRowKey={(r) => r.id} emptyTitle="No risks logged" />
                  </div>
                )}
              </div>
            ),
          },
          {
            id: "pmo",
            label: "PMO",
            content: (
              <PMOTab
                projectId={id}
                projectName={p.name}
                autoAction={pmoAutoAction}
                evm={evm}
                raci={raci}
                stageGates={stageGates}
                contractLedger={contractLedger}
                tasks={tasks}
              />
            ),
          },
        ]}
      />

      <TaskFormModal
        key={taskFormOpen ? "open" : "closed"}
        open={taskFormOpen}
        onClose={() => setTaskFormOpen(false)}
        projectId={id}
        resources={resources.data ?? undefined}
        onCreated={handleTaskCreated}
      />
      <RiskFormModal
        key={`${riskFormOpen}-${editingRisk?.id ?? "new"}`}
        open={riskFormOpen}
        onClose={() => setRiskFormOpen(false)}
        projectId={id}
        risk={editingRisk}
        onSaved={handleRiskSaved}
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
 * the boardroom memo generator (backend app/api/pmo.py). Each sub-panel renders independently
 * so one slow/erroring engine never blocks the others. EVM/contract-ledger numbers are shown
 * with `font-tabular`, matching this app's existing "monospaced executive readout" convention
 * (see the Cost Forecast card above and frontend/app/globals.css's font-tabular usage).
 *
 * `evm`/`raci`/`stageGates`/`contractLedger`/`tasks` are fetched by the parent (ProjectDetailPage),
 * not here (Task 3 perf fix) — this tab's content is unmounted whenever the user switches to another
 * tab (see components/ui/Tabs.tsx), so fetching them locally meant every return trip to this tab
 * re-issued all four PMO requests. Sourcing them from the parent, which fetches once per project
 * visit alongside every other tab's data, keeps this tab's data cached across tab switches.
 */
function PMOTab({
  projectId,
  projectName,
  autoAction,
  evm,
  raci,
  stageGates,
  contractLedger,
  tasks,
}: {
  projectId: string;
  projectName: string;
  autoAction?: { action: PmoCommandDetail["action"]; nonce: number } | null;
  evm: ReturnType<typeof useApi<EVM>>;
  raci: ReturnType<typeof useApi<RaciEntry[]>>;
  stageGates: ReturnType<typeof useApi<StageGate[]>>;
  contractLedger: ReturnType<typeof useApi<ContractLedger>>;
  tasks: ReturnType<typeof useApi<Task[]>>;
}) {
  const memoTrigger = autoAction?.action === "memo" ? autoAction.nonce : null;
  const monteCarloTrigger = autoAction?.action === "montecarlo" ? autoAction.nonce : null;

  return (
    <div className="space-y-6">
      <EVMCard loading={evm.loading} error={evm.error} data={evm.data} onRetry={evm.reload} />
      <WhatIfCard projectId={projectId} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ContractLedgerCard loading={contractLedger.loading} error={contractLedger.error} data={contractLedger.data} onRetry={contractLedger.reload} />
        <StageGatesCard loading={stageGates.loading} error={stageGates.error} data={stageGates.data} onRetry={stageGates.reload} />
      </div>
      <RaciCard loading={raci.loading} error={raci.error} data={raci.data} onRetry={raci.reload} />
      <MonteCarloCard
        tasksData={tasks.data}
        tasksLoading={tasks.loading}
        tasksError={tasks.error}
        onRetryTasks={tasks.reload}
        autoRunTrigger={monteCarloTrigger}
      />
      <BoardroomMemoCard projectId={projectId} projectName={projectName} autoGenerateTrigger={memoTrigger} />
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
  // SV (Schedule Variance = EV - PV) and CV (Cost Variance = EV - AC) aren't in the backend's EVM
  // response — they're the two remaining standard EVM variances not already covered by CPI/SPI/VAC,
  // and both are trivial, exact derivations from fields the response already carries (never a new
  // computation invented client-side).
  const sv = data ? data.ev - data.pv : null;
  const cv = data ? data.ev - data.ac : null;

  const stats: { label: string; value: number | null; format: (n: number) => string; hint?: string; tone?: "critical" | "success" }[] = data
    ? [
        { label: "BAC", value: data.bac, format: (n) => formatCurrency(n), hint: "Budget At Completion" },
        { label: "PV", value: data.pv, format: (n) => formatCurrency(n), hint: "Planned Value" },
        { label: "EV", value: data.ev, format: (n) => formatCurrency(n), hint: "Earned Value" },
        { label: "AC", value: data.ac, format: (n) => formatCurrency(n), hint: "Actual Cost" },
        { label: "CV", value: cv, format: (n) => formatCurrency(n), hint: "Cost Variance (EV − AC)", tone: cv !== null && cv < 0 ? "critical" : "success" },
        { label: "SV", value: sv, format: (n) => formatCurrency(n), hint: "Schedule Variance (EV − PV)", tone: sv !== null && sv < 0 ? "critical" : "success" },
        { label: "CPI", value: data.cpi, format: (n) => n.toFixed(2), hint: "Cost Performance Index" },
        { label: "SPI", value: data.spi, format: (n) => n.toFixed(2), hint: "Schedule Performance Index" },
        { label: "EAC", value: data.eac, format: (n) => formatCurrency(n), hint: "Estimate At Completion" },
        { label: "VAC", value: data.vac, format: (n) => formatCurrency(n), hint: "Variance At Completion", tone: data.vac < 0 ? "critical" : "success" },
      ]
    : [];

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Earned Value Management</CardTitle>
          <CardDescription>{data ? data.method : "Deterministic EVM baseline — BAC / PV / EV / AC / CV / SV / CPI / SPI / EAC / VAC"}</CardDescription>
        </div>
        {data && (
          <div className="flex flex-wrap gap-1.5">
            <Badge tone={cv !== null && cv < 0 ? "critical" : "success"} dot>
              {cv !== null && cv < 0 ? "Over budget" : "On budget"}
            </Badge>
            <Badge tone={sv !== null && sv < 0 ? "critical" : "success"} dot>
              {sv !== null && sv < 0 ? "Delayed" : "Ahead of schedule"}
            </Badge>
          </div>
        )}
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
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-5">
              {stats.map((s) => (
                <div key={s.label}>
                  <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">{s.label}</p>
                  <p className={cn("mt-1 text-lg font-semibold", s.tone === "critical" ? "text-critical-fg" : s.tone === "success" ? "text-success-fg" : "text-text-primary")}>
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

// Deliberately per-project, not portfolio-wide -- EVM/Monte Carlo/task estimates are all
// project-scoped in this schema (see docs/ENTERPRISE_ARCHITECTURE_SPEC.md §2.6), so a true
// cross-portfolio what-if would need a separate aggregation engine, not built here.
function WhatIfCard({ projectId }: { projectId: string }) {
  const [delayDays, setDelayDays] = useState(0);
  const [budgetDelta, setBudgetDelta] = useState(0);
  const [scopeChangePercent, setScopeChangePercent] = useState(0);
  const [result, setResult] = useState<WhatIfResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const hasChanges = delayDays !== 0 || budgetDelta !== 0 || scopeChangePercent !== 0;

  const runScenario = useCallback(async () => {
    setRunning(true);
    setError(null);
    try {
      const data = await pmoApi.whatIf(projectId, {
        delay_days: delayDays,
        budget_delta: budgetDelta,
        scope_change_percent: scopeChangePercent,
      });
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("What-if recalculation failed"));
    } finally {
      setRunning(false);
    }
  }, [projectId, delayDays, budgetDelta, scopeChangePercent]);

  const deltaRows: { label: string; baseline: string; scenario: string; changed: boolean }[] = result
    ? [
        { label: "EAC", baseline: formatCurrency(result.baseline.evm.eac), scenario: formatCurrency(result.scenario.evm.eac), changed: result.baseline.evm.eac !== result.scenario.evm.eac },
        { label: "VAC", baseline: formatCurrency(result.baseline.evm.vac), scenario: formatCurrency(result.scenario.evm.vac), changed: result.baseline.evm.vac !== result.scenario.evm.vac },
        {
          label: "CPI",
          baseline: result.baseline.evm.cpi !== null ? result.baseline.evm.cpi.toFixed(2) : "—",
          scenario: result.scenario.evm.cpi !== null ? result.scenario.evm.cpi.toFixed(2) : "—",
          changed: result.baseline.evm.cpi !== result.scenario.evm.cpi,
        },
        { label: "P50 delivery", baseline: formatDate(result.baseline.monte_carlo.p50_date), scenario: formatDate(result.scenario.monte_carlo.p50_date), changed: result.baseline.monte_carlo.p50_date !== result.scenario.monte_carlo.p50_date },
        { label: "P85 delivery", baseline: formatDate(result.baseline.monte_carlo.p85_date), scenario: formatDate(result.scenario.monte_carlo.p85_date), changed: result.baseline.monte_carlo.p85_date !== result.scenario.monte_carlo.p85_date },
        { label: "P95 delivery", baseline: formatDate(result.baseline.monte_carlo.p95_date), scenario: formatDate(result.scenario.monte_carlo.p95_date), changed: result.baseline.monte_carlo.p95_date !== result.scenario.monte_carlo.p95_date },
      ]
    : [];

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>What-If Scenario Sandbox</CardTitle>
          <CardDescription>Model a delay, budget change, or scope change — recalculates real EVM and Monte Carlo forecasts, nothing is saved</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          <div>
            <div className="flex items-baseline justify-between">
              <label className="text-xs font-medium uppercase tracking-wide text-text-tertiary">Delay</label>
              <span className="font-tabular text-sm font-semibold text-text-primary">{delayDays > 0 ? `+${delayDays}` : delayDays} days</span>
            </div>
            <input
              type="range"
              min={-90}
              max={180}
              step={5}
              value={delayDays}
              onChange={(e) => setDelayDays(Number(e.target.value))}
              className="mt-2 w-full accent-brand-500"
              aria-label="Schedule delay in days"
            />
          </div>
          <div>
            <div className="flex items-baseline justify-between">
              <label className="text-xs font-medium uppercase tracking-wide text-text-tertiary">Budget change</label>
              <span className="font-tabular text-sm font-semibold text-text-primary">{budgetDelta > 0 ? "+" : ""}{formatCompactCurrency(budgetDelta)}</span>
            </div>
            <input
              type="range"
              min={-500000}
              max={500000}
              step={10000}
              value={budgetDelta}
              onChange={(e) => setBudgetDelta(Number(e.target.value))}
              className="mt-2 w-full accent-brand-500"
              aria-label="Budget change in dollars"
            />
          </div>
          <div>
            <div className="flex items-baseline justify-between">
              <label className="text-xs font-medium uppercase tracking-wide text-text-tertiary">Scope change</label>
              <span className="font-tabular text-sm font-semibold text-text-primary">{scopeChangePercent > 0 ? "+" : ""}{scopeChangePercent}%</span>
            </div>
            <input
              type="range"
              min={-50}
              max={100}
              step={5}
              value={scopeChangePercent}
              onChange={(e) => setScopeChangePercent(Number(e.target.value))}
              className="mt-2 w-full accent-brand-500"
              aria-label="Scope change percent"
            />
          </div>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <Button size="sm" loading={running} disabled={!hasChanges} onClick={() => void runScenario()}>
            Recalculate
          </Button>
          {result && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setDelayDays(0);
                setBudgetDelta(0);
                setScopeChangePercent(0);
                setResult(null);
              }}
            >
              Reset
            </Button>
          )}
          <span className="text-xs text-text-tertiary">Nothing here is written to the database — this is a read-only recalculation.</span>
        </div>

        {error && <div className="mt-4"><ErrorState description={error.message} onRetry={() => void runScenario()} /></div>}

        {result && !error && (
          <div className="mt-5 overflow-x-auto border-t border-border-default pt-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-medium uppercase tracking-wide text-text-tertiary">
                  <th className="pb-2 pr-4">Metric</th>
                  <th className="pb-2 pr-4">Baseline (today)</th>
                  <th className="pb-2">Scenario</th>
                </tr>
              </thead>
              <tbody>
                {deltaRows.map((row) => (
                  <tr key={row.label} className="border-t border-border-default">
                    <td className="py-2 pr-4 text-text-secondary">{row.label}</td>
                    <td className="py-2 pr-4 font-tabular text-text-tertiary">{row.baseline}</td>
                    <td className={cn("py-2 font-tabular font-semibold", row.changed ? "text-brand-600 dark:text-brand-400" : "text-text-primary")}>{row.scenario}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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

// ---------------------------------------------------------------------------------------------
// Monte Carlo timeline simulation (Task 3) — genuinely computed client-side over this project's
// real tasks (GET /projects/{id}/tasks, already fetched elsewhere on this page). Nothing here is
// fabricated: every duration sample is a real triangular-distribution draw and every completion
// date is derived from the resulting distribution — but it IS a simplified illustrative model,
// disclosed as such in the UI caption rather than presented as a precise forecast.
//
// Duration model per task (disclosed): optimistic = 0.8 × estimated_hours, most-likely =
// actual_hours if the task is DONE (a real, already-incurred duration) else estimated_hours,
// pessimistic = 1.5 × estimated_hours. A task with no estimated_hours contributes 0 duration
// (honest fallback — there's no real number to model from).
//
// Dependency handling (disclosed): tasks are sequenced along real `depends_on` edges — a task's
// simulated start is the latest simulated finish among its real dependencies, so the total
// project duration for one iteration is the length of the resulting critical path. A task with no
// dependency data (common — dependency modeling here is best-effort over whatever edges the API
// actually returned) is treated as independent, i.e. able to start at time 0.
// ---------------------------------------------------------------------------------------------

const MC_ITERATIONS = 1000;
const MC_OPTIMISTIC_FACTOR = 0.8;
const MC_PESSIMISTIC_FACTOR = 1.5;
const MC_HOURS_PER_DAY = 8; // disclosed simplification — calendar days, weekends not excluded

interface MonteCarloResult {
  totalsHours: number[]; // sorted ascending, one per iteration
  p50Hours: number;
  p85Hours: number;
  p95Hours: number;
  histogram: { bucketStartDays: number; count: number }[];
  taskCount: number;
  dependencyEdgeCount: number;
}

function sampleTriangular(min: number, mode: number, max: number): number {
  if (max <= min) return min;
  const clampedMode = Math.min(Math.max(mode, min), max);
  const u = Math.random();
  const c = (clampedMode - min) / (max - min);
  if (u < c) {
    return min + Math.sqrt(u * (max - min) * (clampedMode - min));
  }
  return max - Math.sqrt((1 - u) * (max - min) * (max - clampedMode));
}

function taskBaseHours(task: Task): number {
  if (task.status === "DONE" && task.actual_hours != null && task.actual_hours > 0) {
    return task.actual_hours;
  }
  return task.estimated_hours ?? 0;
}

/** Topological order over real `depends_on` edges (dependencies before dependents). Falls back to
 * input order for any task caught in a cycle — defensive only; real seeded data has none. */
function topoOrder(tasks: Task[]): string[] {
  const ids = new Set(tasks.map((t) => t.id));
  const deps = new Map(tasks.map((t) => [t.id, (t.depends_on ?? []).filter((d) => ids.has(d))]));
  const order: string[] = [];
  const visited = new Set<string>();
  const inStack = new Set<string>();

  function visit(id: string) {
    if (visited.has(id) || inStack.has(id)) return;
    inStack.add(id);
    for (const dep of deps.get(id) ?? []) visit(dep);
    inStack.delete(id);
    visited.add(id);
    order.push(id);
  }
  for (const t of tasks) visit(t.id);
  return order;
}

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, Math.ceil(p * sortedAsc.length) - 1));
  return sortedAsc[idx];
}

function runMonteCarloSimulation(tasks: Task[]): MonteCarloResult {
  const relevant = tasks.filter((t) => t.status !== "DONE" || (t.actual_hours ?? 0) > 0 || (t.estimated_hours ?? 0) > 0);
  const order = topoOrder(relevant);
  const deps = new Map(relevant.map((t) => [t.id, (t.depends_on ?? []).filter((d) => relevant.some((r) => r.id === d))]));
  const byId = new Map(relevant.map((t) => [t.id, t]));
  const dependencyEdgeCount = [...deps.values()].reduce((s, d) => s + d.length, 0);

  const totals: number[] = [];
  for (let i = 0; i < MC_ITERATIONS; i++) {
    const finish = new Map<string, number>();
    for (const id of order) {
      const task = byId.get(id)!;
      const base = taskBaseHours(task);
      const duration = base > 0 ? sampleTriangular(base * MC_OPTIMISTIC_FACTOR, base, base * MC_PESSIMISTIC_FACTOR) : 0;
      const depIds = deps.get(id) ?? [];
      const start = depIds.length > 0 ? Math.max(0, ...depIds.map((d) => finish.get(d) ?? 0)) : 0;
      finish.set(id, start + duration);
    }
    const total = finish.size > 0 ? Math.max(0, ...[...finish.values()]) : 0;
    totals.push(total);
  }
  totals.sort((a, b) => a - b);

  const p50Hours = percentile(totals, 0.5);
  const p85Hours = percentile(totals, 0.85);
  const p95Hours = percentile(totals, 0.95);

  const maxTotal = totals[totals.length - 1] ?? 0;
  const bucketCount = 20;
  const bucketWidthHours = maxTotal > 0 ? maxTotal / bucketCount : 1;
  const buckets = Array.from({ length: bucketCount }, (_, i) => ({
    bucketStartDays: (i * bucketWidthHours) / MC_HOURS_PER_DAY,
    count: 0,
  }));
  for (const total of totals) {
    const idx = bucketWidthHours > 0 ? Math.min(bucketCount - 1, Math.floor(total / bucketWidthHours)) : 0;
    buckets[idx].count += 1;
  }

  return {
    totalsHours: totals,
    p50Hours,
    p85Hours,
    p95Hours,
    histogram: buckets,
    taskCount: relevant.length,
    dependencyEdgeCount,
  };
}

function hoursToCompletionDate(hours: number): string {
  const days = Math.ceil(hours / MC_HOURS_PER_DAY);
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

/**
 * `tasksData`/`tasksLoading`/`tasksError`/`onRetryTasks` come from the parent's already-fetched
 * `tasks` useApi call (Task 3 perf fix) — this card used to run its own independent
 * `api.tasks(projectId)` fetch, duplicating the exact same request the Tasks/Timeline tabs already
 * make at the top of ProjectDetailPage. Reusing that single fetch avoids a redundant network round
 * trip every time this card mounts (i.e. every time the user visits the PMO tab).
 */
function MonteCarloCard({
  tasksData,
  tasksLoading,
  tasksError,
  onRetryTasks,
  autoRunTrigger,
}: {
  tasksData: Task[] | null;
  tasksLoading: boolean;
  tasksError: Error | null;
  onRetryTasks: () => void;
  autoRunTrigger?: number | null;
}) {
  const [result, setResult] = useState<MonteCarloResult | null>(null);
  const [running, setRunning] = useState(false);

  function run() {
    if (!tasksData || tasksData.length === 0) return;
    setRunning(true);
    // Yield a frame so the "Running…" state actually paints before the (synchronous, but real)
    // 1,000-iteration simulation blocks the main thread for its (sub-second) duration.
    requestAnimationFrame(() => {
      const r = runMonteCarloSimulation(tasksData);
      setResult(r);
      setRunning(false);
    });
  }

  const lastTrigger = useRef<number | null>(null);
  useEffect(() => {
    if (autoRunTrigger == null || autoRunTrigger === lastTrigger.current) return;
    if (tasksLoading) return; // will simply not re-fire once tasks load; a manual click still works
    lastTrigger.current = autoRunTrigger;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- run() flips "Running…" before its real work, same as a manual button click; the command-bar trigger just automates that click
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRunTrigger, tasksLoading]);

  const chartData = useMemo(
    () => (result ? result.histogram.map((b) => ({ day: Math.round(b.bucketStartDays), count: b.count })) : []),
    [result],
  );

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-1.5">
            <Dices className="h-4 w-4 text-brand-600 dark:text-brand-300" aria-hidden="true" />
            Monte Carlo Timeline Simulation
          </CardTitle>
          <CardDescription>
            {MC_ITERATIONS.toLocaleString()} client-side iterations over this project&apos;s real tasks — a simplified,
            illustrative model, not a precise forecast (see assumptions below).
          </CardDescription>
        </div>
        <Button onClick={run} loading={running} disabled={running || tasksLoading || (tasksData ?? []).length === 0} size="sm">
          <Dices className="h-4 w-4" aria-hidden="true" />
          Run Simulation
        </Button>
      </CardHeader>
      <CardContent>
        {tasksError ? (
          <ErrorState description={tasksError.message} onRetry={onRetryTasks} />
        ) : tasksLoading ? (
          <Spinner />
        ) : (tasksData ?? []).length === 0 ? (
          <EmptyState title="No tasks to simulate" description="This project has no tasks yet, so there's nothing to run a timeline simulation over." />
        ) : !result ? (
          <EmptyState
            title="No simulation run yet"
            description={`Click Run Simulation to sample ${MC_ITERATIONS.toLocaleString()} possible timelines from this project's ${(tasksData ?? []).length} real tasks.`}
          />
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {[
                { label: "P50", hours: result.p50Hours, hint: "50% of simulated runs finish by here" },
                { label: "P85", hours: result.p85Hours, hint: "85% of simulated runs finish by here" },
                { label: "P95", hours: result.p95Hours, hint: "95% of simulated runs finish by here" },
              ].map((s) => (
                <div key={s.label} className="rounded-md border border-border-default bg-subtle/40 p-3.5">
                  <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">{s.label} Completion</p>
                  <p className="mt-1 font-tabular text-lg font-semibold text-text-primary">
                    {formatDate(hoursToCompletionDate(s.hours))}
                  </p>
                  <p className="mt-0.5 font-tabular text-xs text-text-tertiary">
                    ~{Math.ceil(s.hours / MC_HOURS_PER_DAY)} days · {Math.round(s.hours)}h
                  </p>
                  <p className="mt-1 text-[11px] text-text-tertiary">{s.hint}</p>
                </div>
              ))}
            </div>

            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ left: 4, right: 12, top: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" vertical={false} />
                  <XAxis
                    dataKey="day"
                    tick={{ fontSize: 11 }}
                    stroke="var(--text-tertiary)"
                    label={{ value: "Simulated duration (days)", position: "insideBottom", offset: -2, fontSize: 11, fill: "var(--text-tertiary)" }}
                  />
                  <YAxis tick={{ fontSize: 11 }} stroke="var(--text-tertiary)" allowDecimals={false} width={32} />
                  <RTooltip
                    formatter={(value) => [`${value} run${value === 1 ? "" : "s"}`, "Simulations"]}
                    labelFormatter={(label) => `~${label} days`}
                    contentStyle={{ background: "var(--surface)", border: "1px solid var(--border-default)", borderRadius: 8, fontSize: 12 }}
                  />
                  <Bar dataKey="count" fill="var(--brand-500)" radius={[3, 3, 0, 0]} />
                  <ReferenceLine x={Math.round(result.p50Hours / MC_HOURS_PER_DAY)} stroke="var(--info-solid)" strokeDasharray="4 3" label={{ value: "P50", fontSize: 10, fill: "var(--info-solid)" }} />
                  <ReferenceLine x={Math.round(result.p95Hours / MC_HOURS_PER_DAY)} stroke="var(--critical-solid)" strokeDasharray="4 3" label={{ value: "P95", fontSize: 10, fill: "var(--critical-solid)" }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <div className="rounded-md border border-border-default bg-subtle/30 px-3.5 py-3 text-[11px] leading-relaxed text-text-tertiary">
              <p className="font-medium text-text-secondary">Model, disclosed:</p>
              <p className="mt-1">
                Per task: optimistic = 0.8× estimated hours, most-likely = actual hours if done else estimated hours,
                pessimistic = 1.5× estimated hours; each iteration draws a triangular-distribution sample per task.
                {result.dependencyEdgeCount > 0
                  ? ` Sequenced along ${result.dependencyEdgeCount} real dependency edge${result.dependencyEdgeCount === 1 ? "" : "s"} across ${result.taskCount} tasks — a task starts only after its real dependencies finish.`
                  : ` No dependency edges were present on these ${result.taskCount} tasks, so all were treated as independently schedulable (best-effort given the real data available).`}
                {" "}Hours convert to calendar days at {MC_HOURS_PER_DAY}h/day; weekends are not excluded. This is a
                simplified illustrative model over real task data, not a guaranteed delivery date.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BoardroomMemoCard({
  projectId,
  projectName,
  autoGenerateTrigger,
}: {
  projectId: string;
  projectName: string;
  autoGenerateTrigger?: number | null;
}) {
  const [memo, setMemo] = useState<BoardroomMemo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Freshly-generated memos play the typewriter reveal (Task 4); a memo restored from state on an
  // unrelated re-render should not replay it, so this flips true only right after generate() lands.
  const [justGenerated, setJustGenerated] = useState(false);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const result = await pmoApi.generateBoardroomMemo(projectId);
      setMemo(result);
      setJustGenerated(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to generate the boardroom memo.");
    } finally {
      setLoading(false);
    }
  }

  // Command-bar "Generate Boardroom Memo for this project" action (Task 5) — fires the same real
  // generate() call a manual click would, once per distinct trigger nonce.
  const lastTrigger = useRef<number | null>(null);
  useEffect(() => {
    if (autoGenerateTrigger == null || autoGenerateTrigger === lastTrigger.current) return;
    lastTrigger.current = autoGenerateTrigger;
    generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoGenerateTrigger]);

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
          <div className="flex flex-col items-center justify-center gap-3 py-10">
            <Spinner />
            <p className="text-xs text-text-tertiary">Synthesizing brief…</p>
          </div>
        )}
        {memo && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border-default pb-4">
              <div>
                <TypewriterText text={memo.narrative.summary} enabled={justGenerated} className="text-sm text-text-secondary" />
                <p className="mt-1 text-xs text-text-tertiary">Generated {formatDate(memo.generated_at)}</p>
              </div>
              <AISourceBadge source={memo.narrative.source} />
            </div>
            {memo.narrative.detail && (
              <TypewriterText
                text={memo.narrative.detail}
                enabled={justGenerated}
                className="whitespace-pre-line text-sm leading-relaxed text-text-secondary"
              />
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
