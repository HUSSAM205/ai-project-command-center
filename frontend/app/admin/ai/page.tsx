"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from "recharts";
import { CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { MetricCard } from "@/components/ui/MetricCard";
import { MotionCard } from "@/components/ui/MotionCard";
import { CardSkeleton } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Select";
import { formatPercent } from "@/lib/utils";

const WINDOW_OPTIONS = [
  { label: "Last 24 hours", value: "24" },
  { label: "Last 7 days", value: "168" },
  { label: "Last 30 days", value: "720" },
];

const tooltipStyle = {
  background: "var(--bg-surface-raised)",
  border: "1px solid var(--border-default)",
  borderRadius: 8,
  fontSize: 12,
  color: "var(--text-primary)",
};

export default function AdminAiPage() {
  const [hours, setHours] = useState(24);
  const providers = useApi(() => api.admin.aiProviders(), []);
  const usage = useApi(() => api.admin.aiUsage(hours), [hours]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">AI Providers &amp; Usage</h1>
        <p className="mt-1 text-sm text-text-tertiary">
          Live circuit-breaker status from the running AI router, plus real usage aggregated from every
          logged AI request.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Provider Status</CardTitle>
            <CardDescription>Configured / circuit-breaker state — not fabricated</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {providers.loading ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <CardSkeleton key={i} />
              ))}
            </div>
          ) : providers.error || !providers.data ? (
            <ErrorState description={providers.error?.message} onRetry={providers.reload} />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {providers.data.map((p) => (
                <div key={p.name} className="rounded-lg border border-border-default p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-text-primary">{p.name}</span>
                    {p.available ? (
                      <CheckCircle2 className="h-4 w-4 text-success-fg" aria-hidden="true" />
                    ) : p.circuit_open ? (
                      <AlertTriangle className="h-4 w-4 text-critical-fg" aria-hidden="true" />
                    ) : (
                      <XCircle className="h-4 w-4 text-text-tertiary" aria-hidden="true" />
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <Badge tone={p.configured ? "success" : "neutral"}>{p.configured ? "Configured" : "No API key"}</Badge>
                    {p.circuit_open && <Badge tone="critical">Circuit open</Badge>}
                  </div>
                  <p className="mt-2 text-xs text-text-tertiary">
                    {p.consecutive_failures} consecutive failure{p.consecutive_failures === 1 ? "" : "s"}
                    {p.cooldown_seconds_remaining != null && ` — ${Math.ceil(p.cooldown_seconds_remaining)}s cooldown left`}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-text-primary">Usage</h2>
        <div className="w-48">
          <Select
            aria-label="Time window"
            options={WINDOW_OPTIONS}
            value={String(hours)}
            onChange={(e) => setHours(Number(e.target.value))}
          />
        </div>
      </div>

      {usage.loading ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : usage.error || !usage.data ? (
        <ErrorState description={usage.error?.message} onRetry={usage.reload} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            <MetricCard label="Total Requests" value={usage.data.total_requests} />
            <MetricCard
              label="Success Rate"
              value={formatPercent(usage.data.success_rate)}
              deltaTone={usage.data.success_rate < 90 && usage.data.total_requests > 0 ? "critical" : "success"}
            />
            <MetricCard label="Avg Latency" value={`${usage.data.avg_latency_ms} ms`} />
          </div>

          <MotionCard>
            <CardHeader>
              <div>
                <CardTitle>Requests by Provider</CardTitle>
                <CardDescription>Aggregated from the real `ai_requests` log — gemini / groq / cache / demo_ai</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {usage.data.provider_breakdown.length === 0 ? (
                <EmptyState title="No AI requests in this window" description="Try a wider time window, or exercise an AI-touching endpoint first." />
              ) : (
                <>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={usage.data.provider_breakdown} barGap={4}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" vertical={false} />
                        <XAxis dataKey="provider" tick={{ fontSize: 11, fill: "var(--text-tertiary)" }} axisLine={{ stroke: "var(--border-default)" }} tickLine={false} />
                        <YAxis tick={{ fontSize: 11, fill: "var(--text-tertiary)" }} axisLine={false} tickLine={false} width={32} allowDecimals={false} />
                        <RTooltip contentStyle={tooltipStyle} />
                        <Bar dataKey="request_count" name="Requests" fill="var(--brand-500)" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full min-w-[420px] text-sm">
                      <thead>
                        <tr className="border-b border-border-default text-xs uppercase tracking-wide text-text-tertiary">
                          <th className="py-2 text-left font-semibold">Provider</th>
                          <th className="py-2 text-right font-semibold">Requests</th>
                          <th className="py-2 text-right font-semibold">Success Rate</th>
                          <th className="py-2 text-right font-semibold">Avg Latency</th>
                        </tr>
                      </thead>
                      <tbody>
                        {usage.data.provider_breakdown.map((row) => (
                          <tr key={row.provider} className="border-b border-border-default last:border-0">
                            <td className="py-2 text-text-primary">{row.provider}</td>
                            <td className="py-2 text-right font-tabular text-text-primary">{row.request_count}</td>
                            <td className="py-2 text-right font-tabular text-text-primary">{formatPercent(row.success_rate)}</td>
                            <td className="py-2 text-right font-tabular text-text-primary">{row.avg_latency_ms} ms</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </CardContent>
          </MotionCard>
        </>
      )}
    </div>
  );
}
