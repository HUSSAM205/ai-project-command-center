"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { ErrorState } from "@/components/ui/ErrorState";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { AuditLogEntry } from "@/lib/types";

const columns: Column<AuditLogEntry>[] = [
  {
    key: "created_at",
    header: "When",
    sortValue: (e) => e.created_at,
    render: (e) => <span className="font-tabular text-text-tertiary">{new Date(e.created_at).toLocaleString()}</span>,
  },
  {
    key: "action",
    header: "Action",
    sortValue: (e) => e.action,
    render: (e) => <Badge tone="info">{e.action}</Badge>,
  },
  {
    key: "entity_type",
    header: "Entity",
    sortValue: (e) => e.entity_type,
    render: (e) => (
      <span className="text-text-secondary">
        {e.entity_type}
        {e.entity_id && <span className="ms-1 font-tabular text-xs text-text-tertiary">{e.entity_id.slice(0, 8)}…</span>}
      </span>
    ),
  },
  {
    key: "actor",
    header: "Actor",
    render: (e) => (
      <span className="font-tabular text-xs text-text-tertiary">
        {e.actor_user_id ? `${e.actor_user_id.slice(0, 8)}…` : "system / anonymous"}
      </span>
    ),
  },
  {
    key: "metadata",
    header: "Details",
    render: (e) => (
      <span className="block max-w-xs truncate text-xs text-text-tertiary" title={JSON.stringify(e.event_metadata)}>
        {Object.keys(e.event_metadata).length > 0 ? JSON.stringify(e.event_metadata) : "—"}
      </span>
    ),
  },
];

export default function AdminAuditPage() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const pageSize = 25;

  const auditLogs = useApi(
    () => api.admin.auditLogs({ page, pageSize, action: action || undefined, entityType: entityType || undefined }),
    [page, action, entityType],
  );

  const totalPages = auditLogs.data ? Math.max(1, Math.ceil(auditLogs.data.total / pageSize)) : 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Audit Log</h1>
        <p className="mt-1 text-sm text-text-tertiary">
          Every audited event for this organization — login, project/task/risk/budget changes, document
          uploads, AI requests, and admin actions.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-56">
          <Input
            label="Filter by action"
            placeholder="e.g. project.created"
            value={action}
            onChange={(e) => {
              setPage(1);
              setAction(e.target.value);
            }}
          />
        </div>
        <div className="w-56">
          <Input
            label="Filter by entity type"
            placeholder="e.g. task"
            value={entityType}
            onChange={(e) => {
              setPage(1);
              setEntityType(e.target.value);
            }}
          />
        </div>
      </div>

      {auditLogs.error ? (
        <ErrorState title="Couldn't load audit log" description={auditLogs.error.message} onRetry={auditLogs.reload} />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={auditLogs.data?.items ?? []}
            loading={auditLogs.loading}
            getRowKey={(e) => e.id}
            emptyTitle="No audit events found"
            emptyDescription="Try clearing the filters, or exercise a write action first."
          />
          {auditLogs.data && auditLogs.data.total > 0 && (
            <div className="flex items-center justify-between text-sm text-text-tertiary">
              <span>
                Page {auditLogs.data.page} of {totalPages} — {auditLogs.data.total} total
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
    </div>
  );
}
