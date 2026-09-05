"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, DollarSign, Repeat, Search, ShieldAlert, Sparkles, Users, Wand2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import type { AssigneeCandidate, BalanceSuggestion } from "@/lib/types";
import { Badge, utilizationTone, type SemanticTone } from "@/components/ui/Badge";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Drawer } from "@/components/ui/Drawer";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/Input";
import { OfflinePreviewBanner } from "@/components/ui/OfflinePreviewBanner";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import type { Resource, ResourceMatrixRow, Task } from "@/lib/types";
import { buildOfflineResources, buildOfflineTasks, withOfflineFallback } from "@/lib/offlinePreview";

const EMPTY_RESOURCES: Resource[] = [];
const EMPTY_TASKS: Task[] = [];

// Data-driven, not hardcoded: any resource whose real workload/capacity ratio exceeds this is
// flagged, computed fresh from GET /api/v1/resources on every render — never a fixed resource list.
const OVER_ALLOCATION_THRESHOLD_PCT = 110;

/** Same semantic tone tokens Badge.tsx's `utilizationTone` maps to (success/warning/critical/info
 * bg-border-fg triples) — reused here as cell classes for the heatmap grid so the grid and every
 * badge elsewhere on this page share one color scale instead of inventing a new one. */
const HEATMAP_TONE_CLASSES: Record<SemanticTone, string> = {
  success: "border-success-border bg-success-bg",
  warning: "border-warning-border bg-warning-bg",
  high: "border-high-border bg-high-bg",
  critical: "border-critical-border bg-critical-bg",
  info: "border-info-border bg-info-bg",
  neutral: "border-border-default bg-subtle",
};

function utilizationRatioPct(r: Resource): number {
  return r.capacity_hours_per_week > 0 ? (r.current_workload_hours_per_week / r.capacity_hours_per_week) * 100 : 0;
}

export default function ResourcesPage() {
  const resourcesApi = useApi(() => withOfflineFallback(() => api.resources(), buildOfflineResources), []);
  const tasksApi = useApi(() => withOfflineFallback(() => api.allTasks(), buildOfflineTasks), []);
  // Real backend endpoint (GET /resources/matrix) -- no offline fallback dataset for this one
  // (it's a secondary/deep-analysis view, not core to the page), so a failure here just shows
  // its own error state rather than degrading the whole page.
  const matrixApi = useApi(() => api.resourceMatrix(), []);

  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [candidates, setCandidates] = useState<AssigneeCandidate[] | null>(null);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);

  // Free-text filter over the main table below -- also what the command bar's per-resource
  // deep-search entries (lib/commands.ts's CommandBar.tsx) land on via ?q=, since there's no
  // dedicated per-resource detail route to deep-link to instead.
  const [query, setQuery] = useState("");
  useEffect(() => {
    // Mount-only, one-time read of a browser-only global -- see the matching comment in
    // app/app/tasks/page.tsx's equivalent effect for why this can't be a lazy useState
    // initializer instead.
    const params = new URLSearchParams(window.location.search);
    const q = params.get("q");
    if (q) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- see comment above
      setQuery(q);
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  const [balanceDrawerOpen, setBalanceDrawerOpen] = useState(false);
  const [balanceSuggestions, setBalanceSuggestions] = useState<BalanceSuggestion[] | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [applyingTaskId, setApplyingTaskId] = useState<string | null>(null);
  const [appliedTaskIds, setAppliedTaskIds] = useState<Set<string>>(new Set());

  const offline = resourcesApi.data?.offline ?? false;
  const resources = resourcesApi.data?.data ?? EMPTY_RESOURCES;
  const tasks = tasksApi.data?.data ?? EMPTY_TASKS;

  const columns: Column<Resource>[] = [
    {
      key: "name",
      header: "Resource",
      sortValue: (r) => r.name,
      render: (r) => (
        <div>
          <p className="font-medium text-text-primary">{r.name}</p>
          <p className="text-xs text-text-tertiary">{r.role} · {r.department}</p>
        </div>
      ),
    },
    {
      key: "skills",
      header: "Skills",
      render: (r) => (
        <div className="flex flex-wrap gap-1">
          {(r.skills ?? []).slice(0, 3).map((s) => (
            <Badge key={s} tone="neutral">{s}</Badge>
          ))}
          {(r.skills ?? []).length > 3 && <Badge tone="neutral">+{r.skills.length - 3}</Badge>}
        </div>
      ),
    },
    {
      key: "utilization",
      header: "Utilization",
      sortValue: (r) => r.current_workload_hours_per_week / Math.max(1, r.capacity_hours_per_week),
      render: (r) => (
        <div className="w-40">
          <ProgressBar
            value={(r.current_workload_hours_per_week / Math.max(1, r.capacity_hours_per_week)) * 100}
            tone={r.utilization_state === "OVERLOADED" ? "critical" : r.utilization_state === "OPTIMAL" ? "success" : "info"}
          />
          <p className="mt-1 font-tabular text-xs text-text-tertiary">
            {r.current_workload_hours_per_week}h / {r.capacity_hours_per_week}h
          </p>
        </div>
      ),
    },
    { key: "state", header: "Status", sortValue: (r) => r.utilization_state, render: (r) => <Badge tone={utilizationTone(r.utilization_state)}>{r.utilization_state}</Badge> },
    { key: "cost", header: "Hourly Cost", align: "right", sortValue: (r) => r.hourly_cost, render: (r) => <span className="font-tabular">${r.hourly_cost}/hr</span> },
    {
      key: "burn",
      header: "Cost Burn",
      align: "right",
      sortValue: (r) => r.cost_burn,
      render: (r) => {
        const overPlanned = r.planned_cost > 0 && r.cost_burn > r.planned_cost;
        return (
          <div>
            <p className={`font-tabular text-sm font-medium ${overPlanned ? "text-critical-fg" : "text-text-primary"}`}>
              ${r.cost_burn.toLocaleString()}
            </p>
            <p className="font-tabular text-[11px] text-text-tertiary">of ${r.planned_cost.toLocaleString()} planned</p>
          </div>
        );
      },
    },
  ];

  const utilizationSummary = useMemo(() => {
    const overloaded = resources.filter((r) => r.utilization_state === "OVERLOADED").length;
    // Real weekly labor cost of everyone's current assigned load -- hourly_cost * this week's
    // actual workload hours, summed across the org. Not a historical/logged figure (that's
    // cost_burn below); this is "what the current bench costs per week right now."
    const weeklyBurnRate = resources.reduce((sum, r) => sum + r.hourly_cost * r.current_workload_hours_per_week, 0);
    const avgUtilizationPct = resources.length > 0
      ? resources.reduce((sum, r) => sum + utilizationRatioPct(r), 0) / resources.length
      : 0;
    return { overloaded, weeklyBurnRate, avgUtilizationPct };
  }, [resources]);

  // Data-driven: computed from the real ratio on every resource, never a hardcoded name list.
  const overAllocated = useMemo(
    () => resources.filter((r) => utilizationRatioPct(r) > OVER_ALLOCATION_THRESHOLD_PCT),
    [resources],
  );

  const filteredResources = useMemo(() => {
    if (!query.trim()) return resources;
    const q = query.trim().toLowerCase();
    return resources.filter((r) => r.name.toLowerCase().includes(q) || (r.role ?? "").toLowerCase().includes(q));
  }, [resources, query]);

  async function openBalanceDrawer() {
    setBalanceDrawerOpen(true);
    setBalanceLoading(true);
    setBalanceError(null);
    try {
      const result = await api.balanceSuggestions();
      setBalanceSuggestions(result);
    } catch (err) {
      setBalanceError(err instanceof ApiError ? err.message : "Could not compute balance suggestions.");
    } finally {
      setBalanceLoading(false);
    }
  }

  async function applyBalanceSuggestion(s: BalanceSuggestion) {
    setApplyingTaskId(s.task_id);
    setBalanceError(null);
    try {
      await api.updateTask(s.task_id, { assignee_id: s.to_resource_id });
      setAppliedTaskIds((prev) => new Set(prev).add(s.task_id));
      resourcesApi.reload();
      tasksApi.reload();
    } catch (err) {
      setBalanceError(err instanceof ApiError ? err.message : "Failed to apply this reassignment.");
    } finally {
      setApplyingTaskId(null);
    }
  }

  async function runSuggest() {
    if (!selectedTaskId) return;
    setSuggestLoading(true);
    setSuggestError(null);
    setCandidates(null);
    try {
      const result = await api.suggestAssignees(selectedTaskId);
      setCandidates(result);
    } catch (err) {
      setSuggestError(err instanceof ApiError ? err.message : "Could not compute suggestions.");
    } finally {
      setSuggestLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Resources</h1>
          <p className="mt-1 text-sm text-text-tertiary">Capacity, allocation, and utilization across the bench</p>
        </div>
        <div className="flex items-center gap-2">
          {offline && (
            <OfflinePreviewBanner onRetry={() => { resourcesApi.reload(); tasksApi.reload(); }} subject="resource data" inline className="mt-1" />
          )}
          <Button onClick={openBalanceDrawer} disabled={offline}>
            <Wand2 className="h-4 w-4" aria-hidden="true" />
            Auto-Balance Portfolio Workload
          </Button>
        </div>
      </div>

      {/* Macro Capacity Ribbon -- every figure computed live from the real /resources payload
          (never a fixed list): total headcount, overloaded count (crimson), average utilization
          across the bench, and the real weekly labor cost of everyone's current assigned load. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-5">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-text-tertiary">
            <Users className="h-3.5 w-3.5" aria-hidden="true" /> Total Human Capital
          </p>
          <p className="mt-2 font-tabular text-xl font-semibold text-text-primary">{resources.length}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">Overloaded Headcount</p>
          <p className="mt-2 font-tabular text-xl font-semibold text-critical-fg">{utilizationSummary.overloaded}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">Average Utilization</p>
          <p className="mt-2 font-tabular text-xl font-semibold text-text-primary">{utilizationSummary.avgUtilizationPct.toFixed(0)}%</p>
        </Card>
        <Card className="p-5">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-text-tertiary">
            <DollarSign className="h-3.5 w-3.5" aria-hidden="true" /> Weekly Burn Rate
          </p>
          <p className="mt-2 font-tabular text-xl font-semibold text-text-primary">${Math.round(utilizationSummary.weeklyBurnRate).toLocaleString()}</p>
        </Card>
      </div>

      <UtilizationHeatmap resources={resources} loading={resourcesApi.loading} error={resourcesApi.error} offline={offline} onRetry={resourcesApi.reload} />

      <ResourceMatrixCard
        rows={matrixApi.data ?? []}
        loading={matrixApi.loading}
        error={matrixApi.error}
        onRetry={matrixApi.reload}
      />

      <RebalanceCard resources={resources} tasks={tasks} overAllocated={overAllocated} offline={offline} onChanged={() => { resourcesApi.reload(); tasksApi.reload(); }} />

      <Card>
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-brand-600 dark:text-brand-300" /> Suggest Assignees
            </CardTitle>
            <CardDescription>Explainable, weighted ranking — skill match, availability, and cost. Not AI-generated.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <Select
              className="w-72"
              label="Task"
              value={selectedTaskId}
              onChange={(e) => setSelectedTaskId(e.target.value)}
              options={tasks.map((t) => ({ label: t.title, value: t.id }))}
              placeholder={tasksApi.loading ? "Loading tasks…" : "Select a task"}
              disabled={tasksApi.loading}
            />
            <Button onClick={runSuggest} loading={suggestLoading} disabled={!selectedTaskId || offline}>
              Find best fit
            </Button>
          </div>

          {offline && <p className="mt-3 text-xs text-text-tertiary">Unavailable while showing offline preview data.</p>}
          {suggestError && <p className="mt-3 text-sm text-critical-fg">{suggestError}</p>}

          {candidates && (
            <ul className="mt-4 space-y-2">
              {candidates.length === 0 && <EmptyState title="No candidates found" />}
              {candidates.map((c, i) => (
                <li key={c.resource_id} className="rounded-md border border-border-default bg-subtle/40 p-3">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm font-medium text-text-primary">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-100 text-[10px] font-semibold text-brand-700 dark:bg-brand-800 dark:text-brand-200">
                        {i + 1}
                      </span>
                      {c.resource_name}
                    </span>
                    <span className="font-tabular text-sm font-semibold text-text-primary">{c.overall.toFixed(0)}</span>
                  </div>
                  <p className="mt-1.5 text-xs text-text-tertiary">{c.explanation}</p>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-text-tertiary">
                    <span>Skill match: <span className="font-tabular font-medium text-text-primary">{c.skill_match_pct.toFixed(0)}%</span></span>
                    <span>Availability: <span className="font-tabular font-medium text-text-primary">{c.availability_pct.toFixed(0)}%</span></span>
                    <span>Cost score: <span className="font-tabular font-medium text-text-primary">{c.cost_score.toFixed(0)}</span></span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="relative max-w-xs">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" aria-hidden="true" />
        <Input
          placeholder="Search resources…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-8"
          aria-label="Search resources"
        />
      </div>

      <DataTable
        columns={columns}
        rows={filteredResources}
        loading={resourcesApi.loading}
        getRowKey={(r) => r.id}
        emptyTitle={query ? "No resources match your search" : "No resources yet"}
      />

      <Drawer
        open={balanceDrawerOpen}
        onClose={() => setBalanceDrawerOpen(false)}
        title="Auto-Balance Portfolio Workload"
        width="lg"
      >
        <p className="mb-4 text-xs text-text-tertiary">
          One real, actionable reassignment per resource currently over {OVER_ALLOCATION_THRESHOLD_PCT}% utilization —
          each candidate has genuine skill overlap with the task and would land at or under 75% utilization after
          taking it. Explainable, not AI-generated; a resource with no qualified under-75% alternative is omitted
          rather than given a mismatched suggestion.
        </p>

        {balanceError && <p className="mb-3 text-sm text-critical-fg">{balanceError}</p>}

        {balanceLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-md border border-border-default bg-subtle" />
            ))}
          </div>
        ) : balanceSuggestions && balanceSuggestions.length === 0 ? (
          <EmptyState
            title="No actionable reassignments right now"
            description={`No overloaded resource currently has both an incomplete task and a genuinely skill-qualified alternative under 75% utilization. Overload may still be real — it just can't be resolved with a single safe reassignment today.`}
          />
        ) : (
          <ul className="space-y-3">
            {balanceSuggestions?.map((s) => {
              const applied = appliedTaskIds.has(s.task_id);
              return (
                <li key={s.task_id} className="rounded-md border border-border-default bg-subtle/40 p-3">
                  <p className="text-sm font-medium text-text-primary">{s.task_title}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-text-tertiary">
                    <span className="font-medium text-critical-fg">{s.from_resource_name}</span>
                    <span className="font-tabular">({s.from_utilization_pct.toFixed(0)}%)</span>
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="font-medium text-text-primary">{s.to_resource_name}</span>
                    <span className="font-tabular">
                      ({s.to_utilization_pct_before.toFixed(0)}% → {s.to_utilization_pct_after.toFixed(0)}%)
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs text-text-tertiary">{s.explanation}</p>
                  <div className="mt-3 flex justify-end">
                    {applied ? (
                      <Badge tone="success" dot>Reassigned</Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => applyBalanceSuggestion(s)}
                        loading={applyingTaskId === s.task_id}
                        disabled={applyingTaskId !== null}
                      >
                        Apply Reassignment <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Drawer>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Task 2, part A: Consultant Resource Heatmap — a visual grid over the real
// current_workload_hours_per_week / capacity_hours_per_week / utilization_state fields GET
// /api/v1/resources already returns. Color comes from Badge.tsx's existing `utilizationTone`
// semantic mapping (reused via HEATMAP_TONE_CLASSES above) — no new color scale. Over-110%
// resources get an explicit flag on top of their tone, computed from the real ratio every render.
// ---------------------------------------------------------------------------------------------

function UtilizationHeatmap({
  resources,
  loading,
  error,
  offline,
  onRetry,
}: {
  resources: Resource[];
  loading: boolean;
  error: Error | null;
  offline: boolean;
  onRetry: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Utilization Heatmap</CardTitle>
          <CardDescription>
            {offline ? (
              <>Offline preview data — cells flagged in red are over {OVER_ALLOCATION_THRESHOLD_PCT}% allocated.</>
            ) : (
              <>
                Every resource, colored by real utilization state. Cells flagged in red with a warning icon are over{" "}
                {OVER_ALLOCATION_THRESHOLD_PCT}% allocated (workload ÷ capacity), computed live from real data — never
                a fixed list.
              </>
            )}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {error ? (
          <ErrorState description={error.message} onRetry={onRetry} />
        ) : loading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-md border border-border-default bg-subtle" />
            ))}
          </div>
        ) : resources.length === 0 ? (
          <EmptyState title="No resources yet" />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {resources.map((r) => {
              const ratio = utilizationRatioPct(r);
              const overThreshold = ratio > OVER_ALLOCATION_THRESHOLD_PCT;
              const tone = utilizationTone(r.utilization_state);
              return (
                <div
                  key={r.id}
                  className={cnHeatmapCell(tone, overThreshold)}
                  title={`${r.name} — ${ratio.toFixed(0)}% allocated (${r.current_workload_hours_per_week}h / ${r.capacity_hours_per_week}h)`}
                >
                  {overThreshold && (
                    <AlertTriangle className="absolute right-1.5 top-1.5 h-3.5 w-3.5 text-critical-fg" aria-hidden="true" />
                  )}
                  <p className="truncate text-xs font-medium text-text-primary">{r.name}</p>
                  <p className="truncate text-[10px] text-text-tertiary">{r.role}</p>
                  <p className="mt-2 font-tabular text-lg font-semibold text-text-primary">{Math.round(ratio)}%</p>
                  <p className="font-tabular text-[10px] text-text-tertiary">
                    {r.current_workload_hours_per_week}h / {r.capacity_hours_per_week}h
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function cnHeatmapCell(tone: SemanticTone, overThreshold: boolean): string {
  const base = "relative rounded-md border p-3 transition-transform hover:scale-[1.02]";
  const toneClass = HEATMAP_TONE_CLASSES[tone];
  const ring = overThreshold ? "ring-1 ring-critical-solid" : "";
  return [base, toneClass, ring].filter(Boolean).join(" ");
}

// ---------------------------------------------------------------------------------------------
// Cross-Project Allocation Matrix: real GET /resources/matrix data (backend/app/services/
// resource_state.py's compute_resource_project_matrix) -- every resource's real allocations
// across every project they're on, with single-point-of-failure flagged when they're the ONLY
// person currently staffed on that project (computed from real resource_allocations, not a
// heuristic guess).
// ---------------------------------------------------------------------------------------------

function ResourceMatrixCard({
  rows,
  loading,
  error,
  onRetry,
}: {
  rows: ResourceMatrixRow[];
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
}) {
  const staffedRows = useMemo(() => rows.filter((r) => r.allocations.length > 0), [rows]);
  const spofCount = useMemo(
    () => staffedRows.reduce((sum, r) => sum + r.allocations.filter((a) => a.is_single_point_of_failure).length, 0),
    [staffedRows],
  );

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-1.5">
            <ShieldAlert className="h-4 w-4 text-text-tertiary" aria-hidden="true" />
            Cross-Project Allocation Matrix
          </CardTitle>
          <CardDescription>
            Every resource&apos;s real project allocations. A project highlighted in red means this person is
            currently the <em>only</em> staff allocated to it — a genuine single point of failure, not a heuristic.
          </CardDescription>
        </div>
        {spofCount > 0 && (
          <Badge tone="critical" dot>
            {spofCount} single point{spofCount === 1 ? "" : "s"} of failure
          </Badge>
        )}
      </CardHeader>
      <CardContent>
        {error ? (
          <ErrorState description={error.message} onRetry={onRetry} />
        ) : loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-md border border-border-default bg-subtle" />
            ))}
          </div>
        ) : staffedRows.length === 0 ? (
          <EmptyState title="No active allocations" description="No resource is currently allocated to a project." />
        ) : (
          <ul className="divide-y divide-border-default">
            {staffedRows.map((r) => (
              <li key={r.resource_id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="w-48 shrink-0">
                  <p className="truncate text-sm font-medium text-text-primary">{r.resource_name}</p>
                  <p className="truncate text-xs text-text-tertiary">{r.role ?? "—"}</p>
                </div>
                <div className="flex flex-1 flex-wrap gap-1.5">
                  {r.allocations.map((a) => (
                    <span
                      key={a.project_id}
                      title={a.is_single_point_of_failure ? `${r.resource_name} is the only staff on ${a.project_name}` : undefined}
                      className={
                        a.is_single_point_of_failure
                          ? "inline-flex items-center gap-1 rounded-full border border-critical-border bg-critical-bg px-2 py-0.5 text-xs font-medium text-critical-fg"
                          : "inline-flex items-center gap-1 rounded-full border border-border-default bg-subtle px-2 py-0.5 text-xs font-medium text-text-secondary"
                      }
                    >
                      {a.is_single_point_of_failure && <ShieldAlert className="h-3 w-3" aria-hidden="true" />}
                      {a.project_name}
                      <span className="font-tabular text-text-tertiary">{a.allocation_percent}%</span>
                    </span>
                  ))}
                </div>
                <span className="font-tabular text-xs text-text-tertiary">
                  {r.workload_hours}h / {r.capacity_hours}h
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------
// Task 2, part B: real "Suggest Rebalance" action. For an over-allocated resource, pick one of
// their real assigned tasks (assignee_id === resource.id) and call the existing, real
// POST /tasks/{id}/suggest-assignees endpoint for ranked, explainable alternative-assignee
// candidates. "Apply" calls the real PATCH /tasks/{id} to reassign — a genuine write, gated by
// the same ApiError/403 read-only handling every other mutating action in this app already uses.
// ---------------------------------------------------------------------------------------------

function RebalanceCard({
  resources,
  tasks,
  overAllocated,
  offline,
  onChanged,
}: {
  resources: Resource[];
  tasks: Task[];
  overAllocated: Resource[];
  offline: boolean;
  onChanged: () => void;
}) {
  const [resourceId, setResourceId] = useState("");
  const [taskId, setTaskId] = useState("");
  const [candidates, setCandidates] = useState<AssigneeCandidate[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [appliedId, setAppliedId] = useState<string | null>(null);

  const selectedResource = resources.find((r) => r.id === resourceId) ?? null;
  const assignedTasks = useMemo(
    () => (selectedResource ? tasks.filter((t) => t.assignee_id === selectedResource.id) : []),
    [tasks, selectedResource],
  );

  function selectResource(id: string) {
    setResourceId(id);
    setTaskId("");
    setCandidates(null);
    setError(null);
    setApplyError(null);
    setAppliedId(null);
  }

  async function suggestRebalance() {
    if (!taskId) return;
    setLoading(true);
    setError(null);
    setCandidates(null);
    setApplyError(null);
    setAppliedId(null);
    try {
      const result = await api.suggestAssignees(taskId);
      // The point of rebalancing is finding somewhere *else* for the work to go.
      setCandidates(result.filter((c) => c.resource_id !== resourceId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not compute rebalance candidates.");
    } finally {
      setLoading(false);
    }
  }

  async function apply(candidate: AssigneeCandidate) {
    if (!taskId) return;
    setApplyingId(candidate.resource_id);
    setApplyError(null);
    try {
      await api.updateTask(taskId, { assignee_id: candidate.resource_id });
      setAppliedId(candidate.resource_id);
      onChanged();
    } catch (err) {
      // ApiError already carries the app's standard "read-only demo session" message on 403
      // (see lib/api.ts's request()) — surfaced verbatim, same as every other mutating action.
      setApplyError(err instanceof ApiError ? err.message : "Failed to reassign this task.");
    } finally {
      setApplyingId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-1.5">
            <Repeat className="h-4 w-4 text-brand-600 dark:text-brand-300" aria-hidden="true" />
            Suggest Rebalance
          </CardTitle>
          <CardDescription>
            For an over-allocated resource, rank real alternative assignees for one of their tasks (skill match /
            availability / cost) and, optionally, actually reassign it.
          </CardDescription>
        </div>
        {overAllocated.length > 0 && (
          <Badge tone="critical" dot>
            {overAllocated.length} over {OVER_ALLOCATION_THRESHOLD_PCT}%
          </Badge>
        )}
      </CardHeader>
      <CardContent>
        {overAllocated.length === 0 ? (
          <EmptyState
            title="No over-allocated resources right now"
            description={`No resource currently exceeds ${OVER_ALLOCATION_THRESHOLD_PCT}% of capacity — nothing to rebalance.`}
          />
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <Select
                className="w-64"
                label="Over-allocated resource"
                value={resourceId}
                onChange={(e) => selectResource(e.target.value)}
                options={overAllocated.map((r) => ({ label: `${r.name} (${Math.round(utilizationRatioPct(r))}%)`, value: r.id }))}
                placeholder="Select a resource"
              />
              <Select
                className="w-64"
                label="Their task to reassign"
                value={taskId}
                onChange={(e) => {
                  setTaskId(e.target.value);
                  setCandidates(null);
                  setApplyError(null);
                  setAppliedId(null);
                }}
                options={assignedTasks.map((t) => ({ label: t.title, value: t.id }))}
                placeholder={!selectedResource ? "Pick a resource first" : assignedTasks.length === 0 ? "No assigned tasks" : "Select a task"}
                disabled={!selectedResource || assignedTasks.length === 0}
              />
              <Button onClick={suggestRebalance} loading={loading} disabled={!taskId || offline}>
                Suggest Rebalance
              </Button>
            </div>
            {offline && <p className="text-xs text-text-tertiary">Unavailable while showing offline preview data.</p>}

            {selectedResource && assignedTasks.length === 0 && (
              <p className="text-xs text-text-tertiary">{selectedResource.name} has no currently assigned tasks in this org.</p>
            )}

            {error && <p className="text-sm text-critical-fg">{error}</p>}
            {applyError && <p className="text-sm text-critical-fg">{applyError}</p>}

            {candidates && (
              <ul className="space-y-2">
                {candidates.length === 0 && <EmptyState title="No alternative candidates found" />}
                {candidates.map((c, i) => (
                  <li key={c.resource_id} className="rounded-md border border-border-default bg-subtle/40 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-2 text-sm font-medium text-text-primary">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-100 text-[10px] font-semibold text-brand-700 dark:bg-brand-800 dark:text-brand-200">
                          {i + 1}
                        </span>
                        {c.resource_name}
                      </span>
                      <div className="flex items-center gap-3">
                        <span className="font-tabular text-sm font-semibold text-text-primary">{c.overall.toFixed(0)}</span>
                        {appliedId === c.resource_id ? (
                          <Badge tone="success" dot>Reassigned</Badge>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => apply(c)}
                            loading={applyingId === c.resource_id}
                            disabled={applyingId !== null}
                          >
                            Apply <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                          </Button>
                        )}
                      </div>
                    </div>
                    <p className="mt-1.5 text-xs text-text-tertiary">{c.explanation}</p>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-text-tertiary">
                      <span>Skill match: <span className="font-tabular font-medium text-text-primary">{c.skill_match_pct.toFixed(0)}%</span></span>
                      <span>Availability: <span className="font-tabular font-medium text-text-primary">{c.availability_pct.toFixed(0)}%</span></span>
                      <span>Cost score: <span className="font-tabular font-medium text-text-primary">{c.cost_score.toFixed(0)}</span></span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
