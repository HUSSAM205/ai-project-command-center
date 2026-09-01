"use client";

import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { ErrorState } from "@/components/ui/ErrorState";
import { Badge, type SemanticTone } from "@/components/ui/Badge";
import { formatDate, initials } from "@/lib/utils";
import type { AdminUser } from "@/lib/types";

const ROLE_TONE: Record<string, SemanticTone> = {
  ADMIN: "critical",
  MANAGER: "info",
  MEMBER: "success",
  VIEWER: "neutral",
};

const columns: Column<AdminUser>[] = [
  {
    key: "name",
    header: "User",
    sortValue: (u) => u.full_name,
    render: (u) => (
      <div className="flex items-center gap-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700 dark:bg-brand-800 dark:text-brand-200">
          {initials(u.full_name)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-text-primary">{u.full_name}</p>
          <p className="truncate text-xs text-text-tertiary">{u.email}</p>
        </div>
      </div>
    ),
  },
  {
    key: "role",
    header: "Role",
    sortValue: (u) => u.role,
    render: (u) => <Badge tone={ROLE_TONE[u.role] ?? "neutral"}>{u.role}</Badge>,
  },
  {
    key: "created_at",
    header: "Joined",
    sortValue: (u) => u.created_at,
    align: "right",
    render: (u) => <span className="font-tabular text-text-tertiary">{formatDate(u.created_at)}</span>,
  },
];

export default function AdminUsersPage() {
  const users = useApi(() => api.admin.users(), []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Users</h1>
        <p className="mt-1 text-sm text-text-tertiary">Every user in this organization — org-scoped, never cross-tenant.</p>
      </div>

      {users.error ? (
        <ErrorState title="Couldn't load users" description={users.error.message} onRetry={users.reload} />
      ) : (
        <DataTable
          columns={columns}
          rows={users.data ?? []}
          loading={users.loading}
          getRowKey={(u) => u.id}
          emptyTitle="No users found"
        />
      )}
    </div>
  );
}
