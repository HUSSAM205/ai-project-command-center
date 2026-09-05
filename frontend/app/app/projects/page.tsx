"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/i18n";
import type { Project } from "@/lib/types";
import { Badge, priorityTone, projectStatusTone, ragStatusTone, riskLevelTone } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { OfflinePreviewBanner } from "@/components/ui/OfflinePreviewBanner";
import { HealthGauge } from "@/components/ui/StatusIndicator";
import { ProjectFormModal } from "@/components/forms/ProjectFormModal";
import { useToast } from "@/components/ui/Toast";
import { formatCompactCurrency, formatDate, titleCase } from "@/lib/utils";
import { buildOfflineDashboard, buildOfflineProjects, withOfflineFallback } from "@/lib/offlinePreview";

const STATUS_OPTIONS = ["PLANNING", "ACTIVE", "ON_HOLD", "AT_RISK", "COMPLETED", "CANCELLED"];
const PRIORITY_OPTIONS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const HEALTH_OPTIONS = [
  { label: "Healthy (80+)", value: "healthy" },
  { label: "Watch (60-79)", value: "watch" },
  { label: "At risk (40-59)", value: "atrisk" },
  { label: "Critical (<40)", value: "critical" },
];

const EMPTY_PROJECTS: Project[] = [];

export default function ProjectsPage() {
  const { t } = useLanguage();
  const router = useRouter();
  const { push } = useToast();
  const projects = useApi(() => withOfflineFallback(() => api.projects(), buildOfflineProjects), []);
  const dashboardApi = useApi(() => withOfflineFallback(() => api.dashboard(), buildOfflineDashboard), []);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [health, setHealth] = useState("");
  const [localProjects, setLocalProjects] = useState<Project[] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const rows = localProjects ?? projects.data?.data ?? EMPTY_PROJECTS;
  const offline = projects.data?.offline ?? false;

  function handleCreated(project: Project) {
    setLocalProjects([project, ...rows]);
    push("Project created", "success");
  }

  async function handleDelete(project: Project) {
    if (!window.confirm(`Delete "${project.name}"? This can't be undone.`)) return;
    const prev = rows;
    setLocalProjects(rows.filter((p) => p.id !== project.id));
    try {
      await api.deleteProject(project.id);
      push("Project deleted", "success");
    } catch (err) {
      setLocalProjects(prev);
      push(err instanceof Error ? err.message : "Could not delete the project", "error");
    }
  }

  const filtered = useMemo(() => {
    return rows.filter((p) => {
      if (query && !p.name.toLowerCase().includes(query.toLowerCase()) && !(p.client ?? "").toLowerCase().includes(query.toLowerCase())) return false;
      if (status && p.status !== status) return false;
      if (priority && p.priority !== priority) return false;
      if (health) {
        const s = p.health_score;
        if (health === "healthy" && !(s >= 80)) return false;
        if (health === "watch" && !(s >= 60 && s < 80)) return false;
        if (health === "atrisk" && !(s >= 40 && s < 60)) return false;
        if (health === "critical" && !(s < 40)) return false;
      }
      return true;
    });
  }, [rows, query, status, priority, health]);

  // RAG distribution is computed from the same project rows already rendered below (real,
  // client-visible data) -- capital/risk/utilization figures instead come from the dashboard
  // summary since per-project rows here don't carry org-wide risk counts.
  const ragCounts = useMemo(() => {
    const counts: Record<string, number> = { ON_TRACK: 0, AT_RISK: 0, CRITICAL: 0, COMPLETED: 0 };
    for (const p of rows) counts[p.rag_status] = (counts[p.rag_status] ?? 0) + 1;
    return counts;
  }, [rows]);
  const dash = dashboardApi.data?.data;
  const openRisks = dash ? Object.values(dash.risk_counts).reduce((a, b) => a + b, 0) : null;

  const columns: Column<Project>[] = [
    {
      key: "name",
      header: "Project",
      sortValue: (p) => p.name,
      render: (p) => (
        <div>
          <p className="font-medium text-text-primary">{p.name}</p>
          <p className="text-xs text-text-tertiary">{p.client ?? "Internal"}</p>
        </div>
      ),
    },
    { key: "status", header: "Status", sortValue: (p) => p.status, render: (p) => <Badge tone={projectStatusTone(p.status)}>{titleCase(p.status)}</Badge> },
    {
      key: "rag",
      header: "RAG",
      sortValue: (p) => p.rag_status,
      render: (p) => (
        <Badge tone={ragStatusTone(p.rag_status)} dot>
          {p.rag_status.replace("_", " ")}
        </Badge>
      ),
    },
    { key: "priority", header: "Priority", sortValue: (p) => p.priority, render: (p) => <Badge tone={priorityTone(p.priority)}>{titleCase(p.priority)}</Badge> },
    {
      key: "health",
      header: "Health",
      sortValue: (p) => p.health_score,
      render: (p) => (
        <div className="flex items-center gap-2">
          <HealthGauge score={p.health_score} size={32} />
          <Badge tone={riskLevelTone(p.risk_level)}>{p.risk_level}</Badge>
        </div>
      ),
    },
    { key: "progress", header: "Progress", align: "right", sortValue: (p) => p.progress, render: (p) => <span className="font-tabular">{p.progress}%</span> },
    {
      key: "budget",
      header: "Budget",
      align: "right",
      sortValue: (p) => p.budget,
      render: (p) => (
        <span className="font-tabular">
          {formatCompactCurrency(p.actual_cost)} / {formatCompactCurrency(p.budget)}
        </span>
      ),
    },
    { key: "end_date", header: "Due", align: "right", sortValue: (p) => p.end_date, render: (p) => <span className="font-tabular">{formatDate(p.end_date)}</span> },
    {
      key: "actions",
      header: "",
      align: "right",
      width: "48px",
      render: (p) => (
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Delete ${p.name}`}
          onClick={(e) => {
            e.stopPropagation();
            void handleDelete(p);
          }}
        >
          <Trash2 className="h-4 w-4 text-text-tertiary" />
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">{t("pageProjectsTitle")}</h1>
          <p className="mt-1 text-sm text-text-tertiary">{filtered.length} of {rows.length} projects</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {offline && <OfflinePreviewBanner onRetry={projects.reload} subject="portfolio data" inline />}
          <Button size="sm" disabled={offline} title={offline ? "Reconnect to create a project" : undefined} onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> New Project
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-lg border border-border-default bg-surface p-4 sm:grid-cols-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">Capital Deployed</p>
          <p className="mt-1 font-tabular text-xl font-semibold text-text-primary">
            {dash ? formatCompactCurrency(dash.total_budget) : "—"}
          </p>
          <p className="text-xs text-text-tertiary">{dash ? `${formatCompactCurrency(dash.total_actual_cost)} actual` : "loading…"}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">Open Risks</p>
          <p className="mt-1 font-tabular text-xl font-semibold text-text-primary">{openRisks ?? "—"}</p>
          <p className="text-xs text-text-tertiary">{dash ? `${dash.risk_counts.CRITICAL} critical` : "loading…"}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">Resource Load</p>
          <p className="mt-1 font-tabular text-xl font-semibold text-text-primary">{dash ? `${dash.resource_utilization_pct}%` : "—"}</p>
          <p className="text-xs text-text-tertiary">across the bench</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">Health Distribution</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <Badge tone={ragStatusTone("ON_TRACK")} dot>{ragCounts.ON_TRACK} on track</Badge>
            <Badge tone={ragStatusTone("AT_RISK")} dot>{ragCounts.AT_RISK} at risk</Badge>
            <Badge tone={ragStatusTone("CRITICAL")} dot>{ragCounts.CRITICAL} critical</Badge>
          </div>
        </div>
      </div>

      <ProjectFormModal key={createOpen ? "open" : "closed"} open={createOpen} onClose={() => setCreateOpen(false)} onCreated={handleCreated} />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
          <Input placeholder="Search projects…" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-8" aria-label="Search projects" />
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
        <Select className="w-44" value={health} onChange={(e) => setHealth(e.target.value)} options={HEALTH_OPTIONS} placeholder="All health levels" />
      </div>

      <DataTable
        columns={columns}
        rows={filtered}
        loading={projects.loading}
        getRowKey={(p) => p.id}
        onRowClick={offline ? undefined : (p) => router.push(`/app/projects/${p.id}`)}
        emptyTitle="No projects match your filters"
      />
    </div>
  );
}
