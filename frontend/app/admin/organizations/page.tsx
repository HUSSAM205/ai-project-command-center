"use client";

import { Building2, Users, FolderKanban, Calendar } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { CardSkeleton } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Badge } from "@/components/ui/Badge";
import { formatDate } from "@/lib/utils";

export default function AdminOrganizationsPage() {
  const org = useApi(() => api.admin.organization(), []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Organization</h1>
        <p className="mt-1 text-sm text-text-tertiary">
          Single-org-per-token by design — an admin sees only their own organization&apos;s details, never a
          cross-tenant list.
        </p>
      </div>

      {org.loading ? (
        <CardSkeleton />
      ) : org.error || !org.data ? (
        <ErrorState title="Couldn't load organization" description={org.error?.message} onRetry={org.reload} />
      ) : (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-100 text-brand-700 dark:bg-brand-800 dark:text-brand-200">
                <Building2 className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <CardTitle className="text-base">{org.data.name}</CardTitle>
                <CardDescription>/{org.data.slug}</CardDescription>
              </div>
            </div>
            {org.data.is_demo && <Badge tone="info">Demo organization</Badge>}
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-lg border border-border-default p-4">
                <dt className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-text-tertiary">
                  <Users className="h-3.5 w-3.5" aria-hidden="true" /> Users
                </dt>
                <dd className="mt-1 font-tabular text-2xl font-semibold text-text-primary">{org.data.user_count}</dd>
              </div>
              <div className="rounded-lg border border-border-default p-4">
                <dt className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-text-tertiary">
                  <FolderKanban className="h-3.5 w-3.5" aria-hidden="true" /> Projects
                </dt>
                <dd className="mt-1 font-tabular text-2xl font-semibold text-text-primary">{org.data.project_count}</dd>
              </div>
              <div className="rounded-lg border border-border-default p-4">
                <dt className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-text-tertiary">
                  <Calendar className="h-3.5 w-3.5" aria-hidden="true" /> Created
                </dt>
                <dd className="mt-1 font-tabular text-2xl font-semibold text-text-primary">{formatDate(org.data.created_at)}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
