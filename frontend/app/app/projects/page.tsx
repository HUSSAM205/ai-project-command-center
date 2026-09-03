"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/i18n";
import type { Project } from "@/lib/types";
import { Badge, priorityTone, projectStatusTone, riskLevelTone } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { OfflinePreviewBanner } from "@/components/ui/OfflinePreviewBanner";
import { HealthGauge } from "@/components/ui/StatusIndicator";
import { ProjectFormModal } from "@/components/forms/ProjectFormModal";
import { useToast } from "@/components/ui/Toast";
import { formatCompactCurrency, formatDate, titleCase } from "@/lib/utils";
import { buildOfflineProjects, withOfflineFallback } from "@/lib/offlinePreview";
import { isPreviewId } from "@/lib/demoSandbox";

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
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [health, setHealth] = useState("");
  const [localProjects, setLocalProjects] = useState<Project[] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const rows = localProjects ?? projects.data?.data ?? EMPTY_PROJECTS;
  const offline = projects.data?.offline ?? false;

  function handleCreated(project: Project, simulated: boolean) {
    setLocalProjects([project, ...rows]);
    push(simulated ? "Project created — sandbox only, not saved" : "Project created", "success");
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
        onRowClick={
          offline
            ? undefined
            : (p) =>
                isPreviewId(p.id)
                  ? push("Sandbox-only projects don't have a detail page — this one was never saved.", "info")
                  : router.push(`/app/projects/${p.id}`)
        }
        emptyTitle="No projects match your filters"
      />
    </div>
  );
}
