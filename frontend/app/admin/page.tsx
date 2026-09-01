"use client";

import Link from "next/link";
import { Users, Building2, Cpu, ScrollText, MessageSquare, CheckCircle2, XCircle } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { MetricCard } from "@/components/ui/MetricCard";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { CardSkeleton } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Badge } from "@/components/ui/Badge";
import { formatDate } from "@/lib/utils";

export default function AdminOverviewPage() {
  const org = useApi(() => api.admin.organization(), []);
  const users = useApi(() => api.admin.users(), []);
  const providers = useApi(() => api.admin.aiProviders(), []);
  const usage = useApi(() => api.admin.aiUsage(24), []);
  const auditLogs = useApi(() => api.admin.auditLogs({ page: 1, pageSize: 5 }), []);

  const loading = org.loading || users.loading || providers.loading || usage.loading;

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (org.error || !org.data) {
    return <ErrorState title="Couldn't load admin overview" description={org.error?.message} onRetry={org.reload} />;
  }

  const availableProviders = (providers.data ?? []).filter((p) => p.available).length;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Admin Overview</h1>
        <p className="mt-1 text-sm text-text-tertiary">
          {org.data.name} — organization-scoped administration, RBAC, and security telemetry.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Link href="/admin/users">
          <MetricCard label="Users" value={users.data?.length ?? 0} icon={<Users className="h-4 w-4" />} hint="in this organization" />
        </Link>
        <Link href="/admin/organizations">
          <MetricCard
            label="Projects"
            value={org.data.project_count}
            icon={<Building2 className="h-4 w-4" />}
            hint={org.data.is_demo ? "Demo organization" : "Organization"}
          />
        </Link>
        <Link href="/admin/ai">
          <MetricCard
            label="AI Providers Up"
            value={`${availableProviders}/${providers.data?.length ?? 0}`}
            icon={<Cpu className="h-4 w-4" />}
            deltaTone={availableProviders === 0 ? "neutral" : "success"}
            hint="incl. Demo AI fallback"
          />
        </Link>
        <Link href="/admin/audit">
          <MetricCard
            label="AI Requests (24h)"
            value={usage.data?.total_requests ?? 0}
            icon={<ScrollText className="h-4 w-4" />}
            hint={usage.data ? `${usage.data.success_rate}% success` : undefined}
          />
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>AI Provider Status</CardTitle>
              <CardDescription>Live circuit-breaker state from the running AI router</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2.5">
              {(providers.data ?? []).map((p) => (
                <li key={p.name} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-text-primary">
                    {p.available ? (
                      <CheckCircle2 className="h-4 w-4 text-success-fg" aria-hidden="true" />
                    ) : (
                      <XCircle className="h-4 w-4 text-text-tertiary" aria-hidden="true" />
                    )}
                    {p.name}
                  </span>
                  <Badge tone={p.available ? "success" : p.configured ? "critical" : "neutral"}>
                    {p.available ? "Available" : p.circuit_open ? "Circuit open" : p.configured ? "Failing" : "Not configured"}
                  </Badge>
                </li>
              ))}
            </ul>
            <Link href="/admin/ai" className="mt-4 inline-block text-xs font-medium text-brand-700 hover:underline dark:text-brand-300">
              View usage breakdown
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Recent Admin/Audit Activity</CardTitle>
              <CardDescription>Latest events across the organization</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {auditLogs.loading ? (
              <div className="h-32 animate-pulse rounded-md bg-subtle" />
            ) : (auditLogs.data?.items.length ?? 0) === 0 ? (
              <p className="text-sm text-text-tertiary">No audit events recorded yet.</p>
            ) : (
              <ul className="divide-y divide-border-default">
                {auditLogs.data!.items.map((entry) => (
                  <li key={entry.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span className="truncate text-text-primary">{entry.action}</span>
                    <span className="shrink-0 font-tabular text-xs text-text-tertiary">{formatDate(entry.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/admin/audit" className="mt-4 inline-block text-xs font-medium text-brand-700 hover:underline dark:text-brand-300">
              View full audit log
            </Link>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-1.5">
              <MessageSquare className="h-4 w-4 text-text-tertiary" aria-hidden="true" />
              Feedback
            </CardTitle>
            <CardDescription>Submitted by any authenticated user, including anonymous demo sessions</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Link href="/admin/feedback" className="text-xs font-medium text-brand-700 hover:underline dark:text-brand-300">
            View submitted feedback
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
