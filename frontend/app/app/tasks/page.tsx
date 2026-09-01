"use client";

import { useMemo, useState } from "react";
import { LayoutGrid, List, Search } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/ui/Toast";
import type { Task, TaskStatus } from "@/lib/types";
import { Badge, priorityTone, taskStatusTone } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { ErrorState } from "@/components/ui/ErrorState";
import { Kanban } from "@/components/viz/Kanban";
import { formatDate, titleCase } from "@/lib/utils";

const STATUS_OPTIONS: TaskStatus[] = ["TODO", "IN_PROGRESS", "BLOCKED", "REVIEW", "DONE"];
const PRIORITY_OPTIONS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const EMPTY_TASKS: Task[] = [];

export default function TasksPage() {
  const { isDemo } = useAuth();
  const { push } = useToast();
  const tasksApi = useApi(() => api.allTasks(), []);
  const [view, setView] = useState<"table" | "kanban">("table");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [localTasks, setLocalTasks] = useState<Task[] | null>(null);

  const tasks = localTasks ?? tasksApi.data ?? EMPTY_TASKS;

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (query && !t.title.toLowerCase().includes(query.toLowerCase())) return false;
      if (status && t.status !== status) return false;
      if (priority && t.priority !== priority) return false;
      return true;
    });
  }, [tasks, query, status, priority]);

  async function handleStatusChange(taskId: string, newStatus: TaskStatus) {
    const prev = tasks;
    setLocalTasks(tasks.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)));
    try {
      await api.updateTask(taskId, { status: newStatus });
      push("Task status updated", "success");
    } catch (err) {
      setLocalTasks(prev);
      push(err instanceof Error ? err.message : "Could not update task status", "error");
    }
  }

  const columns: Column<Task>[] = [
    {
      key: "title",
      header: "Task",
      sortValue: (t) => t.title,
      render: (t) => (
        <div>
          <p className="font-medium text-text-primary">{t.title}</p>
          {t.depends_on && t.depends_on.length > 0 && (
            <p className="text-xs text-text-tertiary">Depends on {t.depends_on.length} task{t.depends_on.length > 1 ? "s" : ""}</p>
          )}
        </div>
      ),
    },
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Tasks</h1>
          <p className="mt-1 text-sm text-text-tertiary">{filtered.length} of {tasks.length} tasks across all projects</p>
        </div>
        <div className="flex items-center gap-1 rounded-md border border-border-default p-0.5">
          <Button variant={view === "table" ? "secondary" : "ghost"} size="sm" onClick={() => setView("table")} aria-pressed={view === "table"}>
            <List className="h-4 w-4" /> Table
          </Button>
          <Button variant={view === "kanban" ? "secondary" : "ghost"} size="sm" onClick={() => setView("kanban")} aria-pressed={view === "kanban"}>
            <LayoutGrid className="h-4 w-4" /> Kanban
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
          <Input placeholder="Search tasks…" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-8" aria-label="Search tasks" />
        </div>
        <Select
          className="w-44"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          options={STATUS_OPTIONS.map((s) => ({ label: titleCase(s), value: s }))}
          placeholder="All statuses"
        />
        <Select
          className="w-40"
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          options={PRIORITY_OPTIONS.map((s) => ({ label: titleCase(s), value: s }))}
          placeholder="All priorities"
        />
      </div>

      {tasksApi.error ? (
        <ErrorState description={tasksApi.error.message} offline={tasksApi.error.message?.includes("offline")} onRetry={tasksApi.reload} />
      ) : view === "table" ? (
        <DataTable columns={columns} rows={filtered} loading={tasksApi.loading} getRowKey={(t) => t.id} emptyTitle="No tasks match your filters" />
      ) : (
        <Kanban tasks={filtered} onStatusChange={handleStatusChange} readOnly={isDemo} />
      )}
    </div>
  );
}
