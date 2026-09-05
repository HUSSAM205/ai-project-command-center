"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarRange, LayoutGrid, List, Search, Plus, Trash2 } from "lucide-react";
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
import { ProgressBar } from "@/components/ui/ProgressBar";
import { EmptyState } from "@/components/ui/EmptyState";
import { ProjectFormModal } from "@/components/forms/ProjectFormModal";
import { useToast } from "@/components/ui/Toast";
import { cn, formatCompactCurrency, formatDate, titleCase } from "@/lib/utils";
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

// Sector is not a stored field on Project -- this repo has no industry-taxonomy column, and
// inventing a per-project value with no real backing would be exactly the "fabricated data" this
// codebase avoids elsewhere. Instead this is a real, deterministic keyword match against each
// project's own name/description/client text; anything that matches nothing gets an honest
// generic label rather than a guessed one.
const SECTOR_KEYWORDS: [RegExp, string][] = [
  [/bank|basel|fintech/i, "FinTech"],
  [/avionics|defense|aerospace|telemetry system/i, "Defense"],
  [/gpu|datacenter|cloud|sovereign cloud/i, "Cloud & AI Infra"],
  [/vaccine|cold-chain|biomedical|health|pharma/i, "Healthcare"],
  [/port logistics|terminal|supply chain/i, "Supply Chain"],
  [/grid|smart meter|energy|utilit/i, "Energy & Utilities"],
  [/5g|open-ran|telecom/i, "Telecom"],
  [/erp|audit|governance/i, "Governance"],
];

function inferSector(project: Project): string {
  const haystack = `${project.name} ${project.description ?? ""} ${project.client ?? ""}`;
  for (const [pattern, label] of SECTOR_KEYWORDS) {
    if (pattern.test(haystack)) return label;
  }
  return "Enterprise";
}

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
  const [view, setView] = useState<"table" | "cards" | "roadmap">("table");

  // Persisted per browser tab (sessionStorage), not a stored preference tied to the account --
  // reads back only after mount so the very first server-rendered paint always matches (avoids a
  // hydration mismatch), then a real return visit within the same tab keeps the last view chosen.
  useEffect(() => {
    try {
      // Reading sessionStorage can only happen client-side, so this can't be a lazy useState
      // initializer without mismatching the server-rendered "table" default during hydration --
      // this is a one-time sync-on-mount read, not a cascading-render risk.
      const stored = window.sessionStorage.getItem("projectsView");
      if (stored === "table" || stored === "cards" || stored === "roadmap") {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setView(stored);
      }
    } catch {
      // sessionStorage can throw in a locked-down browser context -- table view is a fine default
    }
  }, []);
  function changeView(v: "table" | "cards" | "roadmap") {
    setView(v);
    try {
      window.sessionStorage.setItem("projectsView", v);
    } catch {
      // best-effort only
    }
  }

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
        <div className="ml-auto flex items-center gap-1 rounded-md border border-border-default p-0.5">
          <Button variant={view === "cards" ? "secondary" : "ghost"} size="sm" onClick={() => changeView("cards")} aria-pressed={view === "cards"}>
            <LayoutGrid className="h-4 w-4" /> Cards
          </Button>
          <Button variant={view === "table" ? "secondary" : "ghost"} size="sm" onClick={() => changeView("table")} aria-pressed={view === "table"}>
            <List className="h-4 w-4" /> Data Grid
          </Button>
          <Button variant={view === "roadmap" ? "secondary" : "ghost"} size="sm" onClick={() => changeView("roadmap")} aria-pressed={view === "roadmap"}>
            <CalendarRange className="h-4 w-4" /> Roadmap
          </Button>
        </div>
      </div>

      {view === "table" && (
        <DataTable
          columns={columns}
          rows={filtered}
          loading={projects.loading}
          getRowKey={(p) => p.id}
          onRowClick={offline ? undefined : (p) => router.push(`/app/projects/${p.id}`)}
          emptyTitle="No projects match your filters"
        />
      )}
      {view === "cards" && (
        <ProjectCardsGrid projects={filtered} loading={projects.loading} offline={offline} onOpen={(p) => router.push(`/app/projects/${p.id}`)} />
      )}
      {view === "roadmap" && <PortfolioRoadmap projects={filtered} onOpen={(p) => router.push(`/app/projects/${p.id}`)} />}
    </div>
  );
}

function ProjectCardsGrid({
  projects,
  loading,
  offline,
  onOpen,
}: {
  projects: Project[];
  loading: boolean;
  offline: boolean;
  onOpen: (p: Project) => void;
}) {
  if (loading && projects.length === 0) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-44 animate-pulse rounded-lg border border-border-default bg-subtle" />
        ))}
      </div>
    );
  }
  if (projects.length === 0) {
    return <EmptyState title="No projects match your filters" />;
  }
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {projects.map((p) => {
        const burnPct = p.budget > 0 ? (p.actual_cost / p.budget) * 100 : 0;
        return (
          <button
            key={p.id}
            onClick={() => (offline ? undefined : onOpen(p))}
            disabled={offline}
            className="flex flex-col rounded-lg border border-border-default bg-surface p-4 text-left transition-colors hover:border-border-strong hover:bg-subtle disabled:cursor-not-allowed disabled:opacity-70"
          >
            <div className="flex items-start justify-between gap-2">
              <Badge tone="neutral">{inferSector(p)}</Badge>
              <Badge tone={ragStatusTone(p.rag_status)} dot>
                {p.rag_status.replace("_", " ")}
              </Badge>
            </div>
            <p className="mt-3 line-clamp-2 text-sm font-semibold text-text-primary">{p.name}</p>
            <p className="mt-0.5 text-xs text-text-tertiary">{p.client ?? "Internal"}</p>

            <div className="mt-4 flex items-center gap-3">
              <HealthGauge score={p.health_score} size={36} />
              <div className="flex-1">
                <div className="flex items-center justify-between text-[11px] text-text-tertiary">
                  <span>Budget burn</span>
                  <span className="font-tabular">{formatCompactCurrency(p.actual_cost)} / {formatCompactCurrency(p.budget)}</span>
                </div>
                <ProgressBar value={burnPct} tone={burnPct > 100 ? "critical" : burnPct > 85 ? "warning" : "success"} className="mt-1" />
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-border-default pt-3">
              <div className="flex items-center gap-1.5">
                <Badge tone={priorityTone(p.priority)}>{titleCase(p.priority)}</Badge>
              </div>
              <span className="font-tabular text-xs text-text-tertiary">Due {formatDate(p.end_date)}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

const ROADMAP_RAG_BAR: Record<Project["rag_status"], string> = {
  ON_TRACK: "bg-success-solid",
  AT_RISK: "bg-warning-solid",
  CRITICAL: "bg-critical-solid",
  COMPLETED: "bg-info-solid",
};

/** A real, date-scaled timeline -- not a fixed single-year Q1-Q4 grid, since this portfolio's
 * seeded programs genuinely span multiple years (2025-2027). Each bar's position/width is
 * proportional to (start,end) against the min/max across every project actually shown, so it
 * stays accurate as the filtered set changes. */
function PortfolioRoadmap({ projects, onOpen }: { projects: Project[]; onOpen: (p: Project) => void }) {
  const withDates = projects.filter((p) => p.start_date && p.end_date);
  if (withDates.length === 0) {
    return <EmptyState title="No projects with a start and end date to plot" />;
  }
  const starts = withDates.map((p) => new Date(p.start_date!).getTime());
  const ends = withDates.map((p) => new Date(p.end_date!).getTime());
  const minTime = Math.min(...starts);
  const maxTime = Math.max(...ends);
  const span = Math.max(1, maxTime - minTime);

  const quarterMarks: { label: string; pct: number }[] = [];
  const startDate = new Date(minTime);
  const firstQuarterMonth = Math.floor(startDate.getMonth() / 3) * 3;
  const cursor = new Date(startDate.getFullYear(), firstQuarterMonth, 1);
  while (cursor.getTime() <= maxTime) {
    const pct = ((cursor.getTime() - minTime) / span) * 100;
    if (pct >= 0) quarterMarks.push({ label: `Q${Math.floor(cursor.getMonth() / 3) + 1} ${cursor.getFullYear()}`, pct });
    cursor.setMonth(cursor.getMonth() + 3);
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border-default bg-surface p-4">
      <div className="min-w-[720px]">
        <div className="relative mb-2 h-5 border-b border-border-default">
          {quarterMarks.map((q) => (
            <div key={q.label} className="absolute top-0 -translate-x-1/2 text-[10px] text-text-tertiary" style={{ left: `${q.pct}%` }}>
              {q.label}
            </div>
          ))}
        </div>
        <div className="space-y-2">
          {withDates.map((p) => {
            const start = new Date(p.start_date!).getTime();
            const end = new Date(p.end_date!).getTime();
            const leftPct = ((start - minTime) / span) * 100;
            const widthPct = Math.max(0.8, ((end - start) / span) * 100);
            return (
              <div key={p.id} className="flex items-center gap-3">
                <button onClick={() => onOpen(p)} className="w-56 shrink-0 truncate text-left text-xs font-medium text-text-primary hover:underline">
                  {p.name}
                </button>
                <div className="relative h-5 flex-1">
                  {quarterMarks.map((q) => (
                    <div key={q.label} className="absolute inset-y-0 w-px bg-border-default/60" style={{ left: `${q.pct}%` }} />
                  ))}
                  <button
                    onClick={() => onOpen(p)}
                    className={cn("absolute inset-y-0 rounded-sm opacity-90 transition-opacity hover:opacity-100", ROADMAP_RAG_BAR[p.rag_status])}
                    style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                    title={`${p.name}: ${formatDate(p.start_date)} - ${formatDate(p.end_date)}`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
