"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Search, SquarePen, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { QUICK_ACTION_EVENT, type QuickActionDetail } from "@/lib/commands";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/i18n";
import type { Risk } from "@/lib/types";
import { Badge, riskLevelTone } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { OfflinePreviewBanner } from "@/components/ui/OfflinePreviewBanner";
import { Spinner } from "@/components/ui/LoadingState";
import { RiskMatrix } from "@/components/viz/RiskMatrix";
import { RiskRadar } from "@/components/viz/RiskRadar";
import { RiskFormModal } from "@/components/forms/RiskFormModal";
import { useToast } from "@/components/ui/Toast";
import { titleCase } from "@/lib/utils";
import { buildOfflineRisks, buildOfflineProjects, withOfflineFallback } from "@/lib/offlinePreview";

const CATEGORY_OPTIONS = ["SCHEDULE", "BUDGET", "RESOURCE", "TECHNICAL", "SECURITY", "OPERATIONAL", "DEPENDENCY", "EXTERNAL"];
const SEVERITY_OPTIONS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const STATUS_OPTIONS = ["OPEN", "MITIGATING", "CLOSED"];
const EMPTY_RISKS: (Risk & { project_name?: string })[] = [];

export default function RisksPage() {
  const { t } = useLanguage();
  const { isDemo } = useAuth();
  const risksApi = useApi(() => withOfflineFallback(() => api.allRisks(), buildOfflineRisks), []);
  const projectsApi = useApi(() => withOfflineFallback(() => api.projects(), buildOfflineProjects), []);
  const { push } = useToast();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [severity, setSeverity] = useState("");
  const [status, setStatus] = useState("");
  const [localRisks, setLocalRisks] = useState<(Risk & { project_name?: string })[] | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingRisk, setEditingRisk] = useState<Risk | null>(null);
  const [matrixCell, setMatrixCell] = useState<{ p: number; i: number } | null>(null);

  const offline = risksApi.data?.offline ?? false;
  const risks = localRisks ?? risksApi.data?.data ?? EMPTY_RISKS;

  // Command bar's /view-risks and per-risk deep-search entries (lib/commands.ts). See
  // QUICK_ACTION_EVENT's docstring for why there are two delivery mechanisms.
  useEffect(() => {
    function onQuickAction(e: Event) {
      const detail = (e as CustomEvent<QuickActionDetail>).detail;
      if (detail?.action === "view-risks") setSeverity("CRITICAL");
    }
    window.addEventListener(QUICK_ACTION_EVENT, onQuickAction);
    return () => window.removeEventListener(QUICK_ACTION_EVENT, onQuickAction);
  }, []);

  useEffect(() => {
    // Mount-only, one-time read of a browser-only global -- see the matching comment in
    // app/app/tasks/page.tsx's equivalent effect for why this can't be a lazy useState
    // initializer instead.
    const params = new URLSearchParams(window.location.search);
    const q = params.get("q");
    const quick = params.get("quick");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see comment above
    if (q) setQuery(q);
    if (quick === "view-risks") setSeverity("CRITICAL");
    if (q || quick) window.history.replaceState(null, "", window.location.pathname);
  }, []);

  function projectNameFor(projectId: string) {
    return projectsApi.data?.data?.find((p) => p.id === projectId)?.name;
  }

  function handleSaved(risk: Risk, simulated: boolean) {
    const withProjectName = { ...risk, project_name: projectNameFor(risk.project_id) };
    const exists = risks.some((r) => r.id === risk.id);
    setLocalRisks(exists ? risks.map((r) => (r.id === risk.id ? withProjectName : r)) : [withProjectName, ...risks]);
    const verb = exists ? "updated" : "added";
    push(simulated ? `Risk ${verb} — sandbox only, not saved` : `Risk ${verb}`, "success");
  }

  async function handleDelete(risk: Risk) {
    if (!window.confirm(`Delete "${risk.title}"? This can't be undone.`)) return;
    const prev = risks;
    setLocalRisks(risks.filter((r) => r.id !== risk.id));
    if (isDemo) {
      push("Deleted — sandbox only, not saved", "success");
      return;
    }
    try {
      await api.deleteRisk(risk.id);
      push("Risk deleted", "success");
    } catch (err) {
      setLocalRisks(prev);
      push(err instanceof Error ? err.message : "Could not delete the risk", "error");
    }
  }

  function openCreate() {
    setEditingRisk(null);
    setFormOpen(true);
  }

  function openEdit(risk: Risk) {
    setEditingRisk(risk);
    setFormOpen(true);
  }

  const filtered = useMemo(() => {
    return risks.filter((r) => {
      if (query && !r.title.toLowerCase().includes(query.toLowerCase())) return false;
      if (category && r.category !== category) return false;
      if (severity && r.severity !== severity) return false;
      if (status && r.status !== status) return false;
      if (matrixCell && (r.probability !== matrixCell.p || r.impact !== matrixCell.i)) return false;
      return true;
    });
  }, [risks, query, category, severity, status, matrixCell]);

  const columns: Column<Risk & { project_name?: string }>[] = [
    { key: "title", header: "Risk", sortValue: (r) => r.title, render: (r) => <span className="font-medium text-text-primary">{r.title}</span> },
    { key: "project", header: "Project", render: (r) => r.project_name ?? "—" },
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
          <Button variant="ghost" size="icon" aria-label={`Edit ${r.title}`} onClick={() => openEdit(r)}>
            <SquarePen className="h-4 w-4 text-text-tertiary" />
          </Button>
          <Button variant="ghost" size="icon" aria-label={`Delete ${r.title}`} onClick={() => handleDelete(r)}>
            <Trash2 className="h-4 w-4 text-text-tertiary" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">{t("pageRisksTitle")}</h1>
          <p className="mt-1 text-sm text-text-tertiary">{filtered.length} of {risks.length} risks across the portfolio</p>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          {offline && <OfflinePreviewBanner onRetry={risksApi.reload} subject="risk data" inline />}
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" /> Add risk
          </Button>
        </div>
      </div>

      <RiskFormModal
        key={`${formOpen}-${editingRisk?.id ?? "new"}`}
        open={formOpen}
        onClose={() => setFormOpen(false)}
        projects={projectsApi.data?.data}
        risk={editingRisk}
        onSaved={handleSaved}
      />

      <>
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader>
                <div>
                  <CardTitle>Probability × Impact Matrix</CardTitle>
                  <CardDescription>Portfolio-wide risk distribution</CardDescription>
                </div>
              </CardHeader>
              <CardContent>{risksApi.loading ? <Spinner /> : <RiskMatrix risks={risks} onSelect={setMatrixCell} />}</CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Risk Categories</CardTitle>
                  <CardDescription>Severity-weighted score by category — same data, a different lens</CardDescription>
                </div>
              </CardHeader>
              <CardContent>{risksApi.loading ? <Spinner /> : <RiskRadar risks={risks} />}</CardContent>
            </Card>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
              <Input placeholder="Search risks…" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-8" aria-label="Search risks" />
            </div>
            <Select className="w-44" value={category} onChange={(e) => setCategory(e.target.value)} options={CATEGORY_OPTIONS.map((c) => ({ label: titleCase(c), value: c }))} placeholder="All categories" />
            <Select className="w-40" value={severity} onChange={(e) => setSeverity(e.target.value)} options={SEVERITY_OPTIONS.map((s) => ({ label: titleCase(s), value: s }))} placeholder="All severities" />
            <Select className="w-40" value={status} onChange={(e) => setStatus(e.target.value)} options={STATUS_OPTIONS.map((s) => ({ label: titleCase(s), value: s }))} placeholder="All statuses" />
            {matrixCell && (
              <Badge tone="neutral" className="cursor-pointer" onClick={() => setMatrixCell(null)}>
                Matrix: P{matrixCell.p} × I{matrixCell.i} ✕
              </Badge>
            )}
          </div>

          <DataTable columns={columns} rows={filtered} loading={risksApi.loading} getRowKey={(r) => r.id} emptyTitle="No risks match your filters" />
      </>
    </div>
  );
}
