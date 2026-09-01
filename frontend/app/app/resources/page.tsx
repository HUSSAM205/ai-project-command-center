"use client";

import { useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import type { AssigneeCandidate } from "@/lib/types";
import { Badge, utilizationTone } from "@/components/ui/Badge";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import type { Resource, Task } from "@/lib/types";

const EMPTY_RESOURCES: Resource[] = [];
const EMPTY_TASKS: Task[] = [];

export default function ResourcesPage() {
  const resourcesApi = useApi(() => api.resources(), []);
  const tasksApi = useApi(() => api.allTasks(), []);

  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [candidates, setCandidates] = useState<AssigneeCandidate[] | null>(null);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);

  const resources = resourcesApi.data ?? EMPTY_RESOURCES;
  const tasks = tasksApi.data ?? EMPTY_TASKS;

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
  ];

  const utilizationSummary = useMemo(() => {
    const total = resources.length || 1;
    const overloaded = resources.filter((r) => r.utilization_state === "OVERLOADED").length;
    const optimal = resources.filter((r) => r.utilization_state === "OPTIMAL").length;
    const under = resources.filter((r) => r.utilization_state === "UNDERUTILIZED").length;
    return { overloaded, optimal, under, total };
  }, [resources]);

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
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Resources</h1>
        <p className="mt-1 text-sm text-text-tertiary">Capacity, allocation, and utilization across the bench</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">Overloaded</p>
          <p className="mt-2 font-tabular text-xl font-semibold text-critical-fg">{utilizationSummary.overloaded}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">Optimal</p>
          <p className="mt-2 font-tabular text-xl font-semibold text-success-fg">{utilizationSummary.optimal}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">Underutilized</p>
          <p className="mt-2 font-tabular text-xl font-semibold text-info-fg">{utilizationSummary.under}</p>
        </Card>
      </div>

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
            <Button onClick={runSuggest} loading={suggestLoading} disabled={!selectedTaskId}>
              Find best fit
            </Button>
          </div>

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

      {resourcesApi.error ? (
        <ErrorState description={resourcesApi.error.message} offline={resourcesApi.error.message?.includes("offline")} onRetry={resourcesApi.reload} />
      ) : (
        <DataTable columns={columns} rows={resources} loading={resourcesApi.loading} getRowKey={(r) => r.id} emptyTitle="No resources yet" />
      )}
    </div>
  );
}
