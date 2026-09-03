"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import type { Risk } from "@/lib/types";
import { Badge, riskLevelTone } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { OfflinePreviewBanner } from "@/components/ui/OfflinePreviewBanner";
import { Spinner } from "@/components/ui/LoadingState";
import { RiskMatrix } from "@/components/viz/RiskMatrix";
import { RiskRadar } from "@/components/viz/RiskRadar";
import { titleCase } from "@/lib/utils";
import { buildOfflineRisks, withOfflineFallback } from "@/lib/offlinePreview";

const CATEGORY_OPTIONS = ["SCHEDULE", "BUDGET", "RESOURCE", "TECHNICAL", "SECURITY", "OPERATIONAL", "DEPENDENCY", "EXTERNAL"];
const SEVERITY_OPTIONS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const STATUS_OPTIONS = ["OPEN", "MITIGATING", "CLOSED"];
const EMPTY_RISKS: (Risk & { project_name?: string })[] = [];

export default function RisksPage() {
  const risksApi = useApi(() => withOfflineFallback(() => api.allRisks(), buildOfflineRisks), []);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [severity, setSeverity] = useState("");
  const [status, setStatus] = useState("");

  const offline = risksApi.data?.offline ?? false;
  const risks = risksApi.data?.data ?? EMPTY_RISKS;

  const filtered = useMemo(() => {
    return risks.filter((r) => {
      if (query && !r.title.toLowerCase().includes(query.toLowerCase())) return false;
      if (category && r.category !== category) return false;
      if (severity && r.severity !== severity) return false;
      if (status && r.status !== status) return false;
      return true;
    });
  }, [risks, query, category, severity, status]);

  const columns: Column<Risk & { project_name?: string }>[] = [
    { key: "title", header: "Risk", sortValue: (r) => r.title, render: (r) => <span className="font-medium text-text-primary">{r.title}</span> },
    { key: "project", header: "Project", render: (r) => r.project_name ?? "—" },
    { key: "category", header: "Category", sortValue: (r) => r.category, render: (r) => titleCase(r.category) },
    { key: "score", header: "Score", align: "right", sortValue: (r) => r.score, render: (r) => <span className="font-tabular">{r.probability} × {r.impact} = {r.score}</span> },
    { key: "severity", header: "Severity", sortValue: (r) => r.score, render: (r) => <Badge tone={riskLevelTone(r.severity)}>{r.severity}</Badge> },
    { key: "owner", header: "Owner", render: (r) => r.owner ?? "—" },
    { key: "status", header: "Status", sortValue: (r) => r.status, render: (r) => titleCase(r.status) },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Risk Register</h1>
        <p className="mt-1 text-sm text-text-tertiary">{filtered.length} of {risks.length} risks across the portfolio</p>
      </div>

      {offline && <OfflinePreviewBanner onRetry={risksApi.reload} subject="risk data" />}

      <>
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader>
                <div>
                  <CardTitle>Probability × Impact Matrix</CardTitle>
                  <CardDescription>Portfolio-wide risk distribution</CardDescription>
                </div>
              </CardHeader>
              <CardContent>{risksApi.loading ? <Spinner /> : <RiskMatrix risks={risks} />}</CardContent>
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
          </div>

          <DataTable columns={columns} rows={filtered} loading={risksApi.loading} getRowKey={(r) => r.id} emptyTitle="No risks match your filters" />
      </>
    </div>
  );
}
