"use client";

import { useMemo, useState } from "react";
import { Download, Eye, FileSearch, Link2, Lock, ShieldCheck } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { downloadAuditCsv } from "@/lib/api-pmo";
import { useApi } from "@/lib/useApi";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/i18n";
import { useToast } from "@/components/ui/Toast";
import type { AuditLogEntry } from "@/lib/types";
import { Badge, type SemanticTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/LoadingState";
import { formatDate } from "@/lib/utils";

const PAGE_SIZE = 25;

function actionTone(action: string): SemanticTone {
  if (action.includes("created")) return "success";
  if (action.includes("deleted")) return "critical";
  if (action.includes("automation") || action.includes("test_run")) return "high";
  if (action.includes("export")) return "neutral";
  if (action.includes("updated") || action.includes("toggled") || action.includes("assigned")) return "info";
  return "neutral";
}

// A public/read-only viewer's actor_email and ip_address always come back null from the API
// (see backend/app/api/audit.py's redaction) -- but a genuinely system/anonymous-triggered event
// (no real actor_user_id at all) also has a null actor_email. This distinguishes the two rather
// than collapsing both into the same "System / anonymous" label, which would misrepresent a real
// action by a real actor as if no one had done it.
function actorLabel(e: AuditLogEntry, isPublicView: boolean): string {
  if (e.actor_email) return e.actor_email;
  if (isPublicView && e.actor_user_id) return "Hidden in public view";
  return "System / anonymous";
}

function ipLabel(e: AuditLogEntry, isPublicView: boolean): string | null {
  if (e.ip_address) return e.ip_address;
  if (isPublicView && e.actor_user_id) return "Hidden in public view";
  return null;
}

export default function GovernancePage() {
  const { t } = useLanguage();
  const { push } = useToast();
  const { isDemo } = useAuth();

  const [page, setPage] = useState(1);
  const [action, setAction] = useState("");
  const [resourceType, setResourceType] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [inspecting, setInspecting] = useState<AuditLogEntry | null>(null);
  const [exporting, setExporting] = useState(false);

  const healthApi = useApi(() => api.audit.health(), []);
  const logsApi = useApi(
    () =>
      api.audit.logs({
        page,
        pageSize: PAGE_SIZE,
        action: action || undefined,
        resourceType: resourceType || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      }),
    [page, action, resourceType, dateFrom, dateTo],
  );

  const totalPages = logsApi.data ? Math.max(1, Math.ceil(logsApi.data.total / PAGE_SIZE)) : 1;

  // A real computed ratio of verified controls (see GET /audit/health), not a certified SOC2
  // audit result -- deliberately never a specific unearned percentage like "98%".
  const readiness = useMemo(() => {
    const h = healthApi.data;
    if (!h) return null;
    const checks = [
      h.tenant_isolation_status === "Enforced",
      h.transport_encryption_status === "TLS enforced",
      h.storage_encryption_status === "Provider-managed",
      h.chain_status === "Active",
    ];
    const passed = checks.filter(Boolean).length;
    return { pct: Math.round((passed / checks.length) * 100), passed, total: checks.length };
  }, [healthApi.data]);

  const columns: Column<AuditLogEntry>[] = [
    {
      key: "created_at",
      header: "Timestamp",
      sortValue: (e) => e.created_at,
      render: (e) => <span className="font-tabular text-xs text-text-tertiary">{formatDate(e.created_at)}</span>,
    },
    {
      key: "actor",
      header: "Actor",
      render: (e) => {
        const ip = ipLabel(e, isDemo);
        return (
          <div>
            <p className="text-sm text-text-primary">{actorLabel(e, isDemo)}</p>
            {ip && <p className="font-tabular text-[11px] text-text-tertiary">{ip}</p>}
          </div>
        );
      },
    },
    {
      key: "action",
      header: "Action",
      sortValue: (e) => e.action,
      render: (e) => <Badge tone={actionTone(e.action)}>{e.action}</Badge>,
    },
    {
      key: "entity_type",
      header: "Resource Type",
      sortValue: (e) => e.entity_type,
      render: (e) => (
        <span className="text-text-secondary">
          {e.entity_type}
          {e.entity_id && <span className="ms-1 font-tabular text-xs text-text-tertiary">{e.entity_id.slice(0, 8)}…</span>}
        </span>
      ),
    },
    {
      key: "inspect",
      header: "",
      align: "right",
      render: (e) => (
        <Button size="sm" variant="outline" onClick={() => setInspecting(e)}>
          <FileSearch className="h-3.5 w-3.5" aria-hidden="true" /> Inspect Metadata
        </Button>
      ),
    },
  ];

  async function handleExport() {
    setExporting(true);
    try {
      await downloadAuditCsv({
        action: action || undefined,
        resourceType: resourceType || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });
      push("Audit trail exported", "success");
    } catch (err) {
      push(err instanceof ApiError ? err.message : "Could not export the audit trail.", "error");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-6">
      {isDemo && (
        <div className="flex items-center gap-2 rounded-full border border-info-border bg-info-bg px-4 py-2 text-xs font-medium text-info-fg">
          <Eye className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Public Evaluation Mode (Read-Only) — full compliance &amp; audit data visible for portfolio
          review. Real actor emails and IP addresses are hidden here; sign in with a full account to
          see them.
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">{t("pageGovernanceTitle")}</h1>
          <p className="mt-1 max-w-2xl text-sm text-text-tertiary">
            Real, tamper-evident audit trail for this organization -- every row below is an actual
            audit_logs record, hash-chained at write time (see the Chain Integrity tile).
          </p>
        </div>
        <Button onClick={handleExport} loading={exporting} disabled={exporting}>
          <Download className="h-4 w-4" aria-hidden="true" /> Export Audit Log (.CSV)
        </Button>
      </div>

      {/* Compliance HUD -- every figure here is computed live from GET /audit/health, never a
          hardcoded status. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-5">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-text-tertiary">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> Compliance Readiness
          </p>
          {healthApi.loading ? (
            <Spinner className="mt-2" />
          ) : (
            <>
              <p className="mt-2 font-tabular text-xl font-semibold text-text-primary">{readiness?.pct ?? "—"}%</p>
              <p className="mt-1 text-[11px] text-text-tertiary">
                {readiness ? `${readiness.passed} of ${readiness.total} controls verified` : "Unavailable"} — a real
                computed ratio, not a certified SOC2 report
              </p>
            </>
          )}
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">Tenant Isolation</p>
          <p className="mt-2 text-lg font-semibold text-success-fg">{healthApi.data?.tenant_isolation_status ?? "—"}</p>
          <p className="mt-1 text-[11px] text-text-tertiary">{healthApi.data?.tenant_isolation_detail}</p>
        </Card>
        <Card className="p-5">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-text-tertiary">
            <Link2 className="h-3.5 w-3.5" aria-hidden="true" /> Audit Chain Integrity
          </p>
          <p
            className={`mt-2 text-lg font-semibold ${healthApi.data?.chain_status === "Active" ? "text-success-fg" : healthApi.data?.chain_status === "Broken" ? "text-critical-fg" : "text-text-tertiary"}`}
          >
            {healthApi.data?.chain_status ?? "—"}
          </p>
          <p className="mt-1 text-[11px] text-text-tertiary">
            {healthApi.data ? `${healthApi.data.chain_records_verified} of ${healthApi.data.chain_total_hash_chained} hash-chained records verified` : ""}
          </p>
        </Card>
        <Card className="p-5">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-text-tertiary">
            <Lock className="h-3.5 w-3.5" aria-hidden="true" /> Encryption
          </p>
          <p className="mt-2 text-sm font-semibold text-text-primary">{healthApi.data?.transport_encryption_status ?? "—"} (transit)</p>
          <p className="text-sm font-semibold text-text-primary">{healthApi.data?.storage_encryption_status ?? "—"} (at rest)</p>
        </Card>
      </div>

      {/* Enterprise terminology reference -- real translations, live-switching with the language
          selector (lib/i18n.tsx), not placeholder keys. */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Enterprise Terminology</CardTitle>
            <CardDescription>Canonical platform terms in the current language.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {(
            [
              ["termPortfolio", "Portfolio"],
              ["termCriticalPath", "Critical Path"],
              ["termHealthScore", "Health Score"],
              ["termWorkloadBalancer", "Workload Balancer"],
              ["termAuditTrail", "Audit Trail"],
              ["termAutomations", "Automations"],
            ] as const
          ).map(([key, enLabel]) => (
            <div key={key} className="rounded-md border border-border-default bg-subtle/40 p-3">
              <p className="text-[11px] uppercase tracking-wide text-text-tertiary">{enLabel}</p>
              <p className="mt-1 text-sm font-medium text-text-primary">{t(key)}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Audit Trail</CardTitle>
            <CardDescription>Filterable by resource type, action, and date range.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-48">
              <Input
                label="Action"
                placeholder="e.g. risk.created"
                value={action}
                onChange={(e) => {
                  setPage(1);
                  setAction(e.target.value);
                }}
              />
            </div>
            <div className="w-48">
              <Input
                label="Resource type"
                placeholder="e.g. task"
                value={resourceType}
                onChange={(e) => {
                  setPage(1);
                  setResourceType(e.target.value);
                }}
              />
            </div>
            <div className="w-40">
              <Input
                type="date"
                label="From"
                value={dateFrom}
                onChange={(e) => {
                  setPage(1);
                  setDateFrom(e.target.value);
                }}
              />
            </div>
            <div className="w-40">
              <Input
                type="date"
                label="To"
                value={dateTo}
                onChange={(e) => {
                  setPage(1);
                  setDateTo(e.target.value);
                }}
              />
            </div>
          </div>

          {logsApi.error ? (
            <ErrorState title="Couldn't load the audit trail" description={logsApi.error.message} onRetry={logsApi.reload} />
          ) : (
            <>
              <DataTable
                columns={columns}
                rows={logsApi.data?.items ?? []}
                loading={logsApi.loading}
                getRowKey={(e) => e.id}
                emptyTitle="No audit events found"
                emptyDescription="Try clearing the filters, or exercise a write action first."
              />
              {logsApi.data && logsApi.data.total > 0 && (
                <div className="flex items-center justify-between text-sm text-text-tertiary">
                  <span>
                    Page {logsApi.data.page} of {totalPages} — {logsApi.data.total} total
                  </span>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                      Previous
                    </Button>
                    <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Modal
        open={inspecting !== null}
        onClose={() => setInspecting(null)}
        title="Audit Record Metadata"
        description={inspecting?.id}
        size="lg"
      >
        {inspecting && (
          <div className="space-y-3 text-sm">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <dt className="text-text-tertiary">Action</dt>
              <dd className="text-text-primary">{inspecting.action}</dd>
              <dt className="text-text-tertiary">Resource</dt>
              <dd className="text-text-primary">
                {inspecting.entity_type} {inspecting.entity_id ?? ""}
              </dd>
              <dt className="text-text-tertiary">Actor</dt>
              <dd className="text-text-primary">{actorLabel(inspecting, isDemo)}</dd>
              <dt className="text-text-tertiary">Session</dt>
              <dd className="font-tabular text-text-primary">{inspecting.session_id ?? "—"}</dd>
              <dt className="text-text-tertiary">IP address</dt>
              <dd className="font-tabular text-text-primary">{ipLabel(inspecting, isDemo) ?? "—"}</dd>
              <dt className="text-text-tertiary">Timestamp</dt>
              <dd className="font-tabular text-text-primary">{formatDate(inspecting.created_at)}</dd>
              <dt className="text-text-tertiary">Record hash</dt>
              <dd className="break-all font-tabular text-[11px] text-text-primary">{inspecting.record_hash ?? "not hash-chained"}</dd>
              <dt className="text-text-tertiary">Previous hash</dt>
              <dd className="break-all font-tabular text-[11px] text-text-primary">{inspecting.prev_hash ?? "—"}</dd>
            </dl>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-tertiary">Changes payload</p>
              <pre className="max-h-64 overflow-auto rounded-md border border-border-default bg-subtle/40 p-3 text-xs text-text-secondary">
                {JSON.stringify(inspecting.event_metadata, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
