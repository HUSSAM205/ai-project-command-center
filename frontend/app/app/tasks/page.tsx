"use client";

import { useEffect, useMemo, useState } from "react";
import { LayoutGrid, List, Plus, Search, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/i18n";
import { QUICK_ACTION_EVENT, type QuickActionDetail } from "@/lib/commands";
import { useToast } from "@/components/ui/Toast";
import type { Task, TaskStatus } from "@/lib/types";
import { Badge, priorityTone, taskStatusTone } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { OfflinePreviewBanner } from "@/components/ui/OfflinePreviewBanner";
import { Kanban } from "@/components/viz/Kanban";
import { TaskFormModal } from "@/components/forms/TaskFormModal";
import { formatDate, titleCase } from "@/lib/utils";
import { buildOfflineTasks, buildOfflineProjects, buildOfflineResources, withOfflineFallback } from "@/lib/offlinePreview";

const STATUS_OPTIONS: TaskStatus[] = ["TODO", "IN_PROGRESS", "BLOCKED", "REVIEW", "DONE"];
const PRIORITY_OPTIONS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const EMPTY_TASKS: Task[] = [];

export default function TasksPage() {
  const { t } = useLanguage();
  const { isDemo } = useAuth();
  const { push } = useToast();
  const tasksApi = useApi(() => withOfflineFallback(() => api.allTasks(), buildOfflineTasks), []);
  const projectsApi = useApi(() => withOfflineFallback(() => api.projects(), buildOfflineProjects), []);
  const resourcesApi = useApi(() => withOfflineFallback(() => api.resources(), buildOfflineResources), []);
  const [view, setView] = useState<"table" | "kanban">("table");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [localTasks, setLocalTasks] = useState<Task[] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const offline = tasksApi.data?.offline ?? false;
  const tasks = localTasks ?? tasksApi.data?.data ?? EMPTY_TASKS;

  // Command bar's /new-task and per-task deep-search entries (lib/commands.ts) -- the immediate
  // path (already on this page) and the ?quick=/?q= navigation path, respectively. See
  // QUICK_ACTION_EVENT's docstring for why both delivery mechanisms exist.
  useEffect(() => {
    function onQuickAction(e: Event) {
      const detail = (e as CustomEvent<QuickActionDetail>).detail;
      if (detail?.action === "new-task") setCreateOpen(true);
    }
    window.addEventListener(QUICK_ACTION_EVENT, onQuickAction);
    return () => window.removeEventListener(QUICK_ACTION_EVENT, onQuickAction);
  }, []);

  useEffect(() => {
    // Mount-only, one-time read of a browser-only global (window.location.search) -- there is no
    // SSR-safe way to read this outside an effect (a lazy useState initializer would run during
    // the static prerender pass, where `window` doesn't exist, and wouldn't re-run on hydration
    // anyway). Deliberately does NOT re-run on a same-page query-string change (see
    // QUICK_ACTION_EVENT's docstring) -- a fresh navigation from elsewhere always remounts this
    // page, which is the only case this needs to catch.
    const params = new URLSearchParams(window.location.search);
    const q = params.get("q");
    const quick = params.get("quick");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see comment above
    if (q) setQuery(q);
    if (quick === "new-task") setCreateOpen(true);
    if (q || quick) window.history.replaceState(null, "", window.location.pathname);
  }, []);

  function handleCreated(task: Task, simulated: boolean) {
    setLocalTasks([task, ...tasks]);
    push(simulated ? "Task created — sandbox only, not saved" : "Task created", "success");
  }

  async function handleDelete(task: Task) {
    if (!window.confirm(`Delete "${task.title}"? This can't be undone.`)) return;
    const prev = tasks;
    setLocalTasks(tasks.filter((t) => t.id !== task.id));
    if (isDemo) {
      push("Deleted — sandbox only, not saved", "success");
      return;
    }
    try {
      await api.deleteTask(task.id);
      push("Task deleted", "success");
    } catch (err) {
      setLocalTasks(prev);
      push(err instanceof Error ? err.message : "Could not delete the task", "error");
    }
  }

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
    if (isDemo) {
      push("Status updated — sandbox only, not saved", "success");
      return;
    }
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
    {
      key: "actions",
      header: "",
      align: "right",
      width: "48px",
      render: (t) => (
        <Button variant="ghost" size="icon" aria-label={`Delete ${t.title}`} onClick={() => handleDelete(t)}>
          <Trash2 className="h-4 w-4 text-text-tertiary" />
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">{t("pageTasksTitle")}</h1>
          <p className="mt-1 text-sm text-text-tertiary">{filtered.length} of {tasks.length} tasks across all projects</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {offline && <OfflinePreviewBanner onRetry={tasksApi.reload} subject="tasks" inline />}
          <div className="flex items-center gap-1 rounded-md border border-border-default p-0.5">
            <Button variant={view === "table" ? "secondary" : "ghost"} size="sm" onClick={() => setView("table")} aria-pressed={view === "table"}>
              <List className="h-4 w-4" /> Table
            </Button>
            <Button variant={view === "kanban" ? "secondary" : "ghost"} size="sm" onClick={() => setView("kanban")} aria-pressed={view === "kanban"}>
              <LayoutGrid className="h-4 w-4" /> Kanban
            </Button>
          </div>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> New task
          </Button>
        </div>
      </div>

      <TaskFormModal
        key={createOpen ? "open" : "closed"}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        projects={projectsApi.data?.data}
        resources={resourcesApi.data?.data}
        onCreated={handleCreated}
      />

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

      {view === "table" ? (
        <DataTable columns={columns} rows={filtered} loading={tasksApi.loading} getRowKey={(t) => t.id} emptyTitle="No tasks match your filters" />
      ) : (
        <Kanban tasks={filtered} onStatusChange={handleStatusChange} readOnly={offline} />
      )}
    </div>
  );
}
