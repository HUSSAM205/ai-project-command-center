"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { FolderKanban, Wallet, TrendingUp, ShieldAlert } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { MetricCard } from "@/components/ui/MetricCard";
import { MotionCard } from "@/components/ui/MotionCard";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { CardSkeleton } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge, riskLevelTone, SOLID_COLORS } from "@/components/ui/Badge";
import { formatCompactCurrency, formatDate, formatDateShort, formatPercent } from "@/lib/utils";

const SEVERITY_COLORS: Record<string, string> = {
  LOW: SOLID_COLORS[riskLevelTone("LOW")],
  MEDIUM: SOLID_COLORS[riskLevelTone("MEDIUM")],
  HIGH: SOLID_COLORS[riskLevelTone("HIGH")],
  CRITICAL: SOLID_COLORS[riskLevelTone("CRITICAL")],
};

const tooltipStyle = {
  background: "var(--bg-surface-raised)",
  border: "1px solid var(--border-default)",
  borderRadius: 8,
  fontSize: 12,
  color: "var(--text-primary)",
};

export default function AnalyticsPage() {
  const analytics = useApi(() => api.analytics(), []);

  const severityEntries = useMemo(() => {
    if (!analytics.data) return [];
    return Object.entries(analytics.data.risk_snapshot.severity_counts).filter(([, v]) => v > 0);
  }, [analytics.data]);

  if (analytics.loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (analytics.error || !analytics.data) {
    return (
      <ErrorState
        title="Couldn't load analytics"
        description={analytics.error?.message}
        offline={analytics.error?.message?.includes("offline")}
        onRetry={analytics.reload}
      />
    );
  }

  const d = analytics.data;
  const burnRatePct = d.total_budget > 0 ? (d.total_actual_cost / d.total_budget) * 100 : 0;
  const latestCompletion = d.task_completion_trend.at(-1);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Portfolio Analytics</h1>
          <p className="mt-1 text-sm text-text-tertiary">
            Trends derived from real project data — {d.organization_name}, generated {formatDate(d.generated_at)}.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <MetricCard label="Total Projects" value={<AnimatedNumber value={d.total_projects} />} icon={<FolderKanban className="h-4 w-4" />} />
        <MetricCard
          label="Portfolio Spend"
          value={<AnimatedNumber value={d.total_actual_cost} format={(n) => formatCompactCurrency(n)} />}
          hint={`of ${formatCompactCurrency(d.total_budget)} budget`}
          icon={<Wallet className="h-4 w-4" />}
        />
        <MetricCard
          label="Burn Rate"
          value={<AnimatedNumber value={burnRatePct} format={(n) => formatPercent(n)} />}
          deltaTone={burnRatePct > 100 ? "critical" : "neutral"}
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <MetricCard
          label="Task Completion"
          value={
            latestCompletion ? (
              <AnimatedNumber value={latestCompletion.completion_rate_pct} format={(n) => formatPercent(n)} />
            ) : (
              "—"
            )
          }
          hint={latestCompletion ? `as of ${latestCompletion.period}` : "no due-dated tasks"}
          icon={<ShieldAlert className="h-4 w-4" />}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Budget burn-rate trend */}
        <MotionCard className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Budget Burn-Rate Trend</CardTitle>
              <CardDescription>Cumulative portfolio spend over time, from recorded transactions</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {d.budget_burn_trend.length === 0 ? (
              <EmptyState title="No dated transactions yet" description="Add budget transactions with a date to see the burn trend." />
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={d.budget_burn_trend} margin={{ left: 0, right: 8 }}>
                    <defs>
                      <linearGradient id="burnFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--brand-500)" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="var(--brand-500)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(v) => formatDateShort(v)}
                      tick={{ fontSize: 11, fill: "var(--text-tertiary)" }}
                      axisLine={{ stroke: "var(--border-default)" }}
                      tickLine={false}
                      minTickGap={24}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "var(--text-tertiary)" }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => formatCompactCurrency(v)}
                      width={56}
                    />
                    <RTooltip
                      contentStyle={tooltipStyle}
                      labelFormatter={(v) => formatDate(v as string)}
                      formatter={(v, name) => [formatCompactCurrency(Number(v)), name === "cumulative_spend" ? "Cumulative" : "That day"]}
                    />
                    <Area type="monotone" dataKey="cumulative_spend" stroke="var(--brand-600)" fill="url(#burnFill)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </MotionCard>

        {/* Risk severity snapshot */}
        <MotionCard>
          <CardHeader>
            <div>
              <CardTitle>Risk Severity Snapshot</CardTitle>
              <CardDescription>Point-in-time, not a trend</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {severityEntries.length === 0 ? (
              <EmptyState title="No risks recorded" />
            ) : (
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <defs>
                      {/* Per-severity radial gradient (center full-strength, edge softened) instead of
                          a flat fill — same severity color throughout, no new hues, just depth. */}
                      {severityEntries.map(([k]) => (
                        <radialGradient key={k} id={`risk-severity-${k}`} cx="35%" cy="35%" r="75%">
                          <stop offset="0%" stopColor={SEVERITY_COLORS[k] ?? "var(--neutral-400)"} stopOpacity={1} />
                          <stop offset="100%" stopColor={SEVERITY_COLORS[k] ?? "var(--neutral-400)"} stopOpacity={0.72} />
                        </radialGradient>
                      ))}
                    </defs>
                    <Pie data={severityEntries.map(([k, v]) => ({ name: k, value: v }))} dataKey="value" nameKey="name" innerRadius={38} outerRadius={60} paddingAngle={2}>
                      {severityEntries.map(([k]) => (
                        <Cell key={k} fill={`url(#risk-severity-${k})`} />
                      ))}
                    </Pie>
                    <RTooltip contentStyle={tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
            <ul className="mt-1 space-y-1.5">
              {severityEntries.map(([k, v]) => (
                <li key={k} className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-text-secondary">
                    <span className="h-2 w-2 rounded-full" style={{ background: SEVERITY_COLORS[k] }} />
                    {k}
                  </span>
                  <AnimatedNumber value={v} className="font-medium text-text-primary" />
                </li>
              ))}
            </ul>
            <div className="mt-3 flex items-center gap-3 border-t border-border-default pt-3 text-xs">
              <Badge tone="warning">
                <AnimatedNumber value={d.risk_snapshot.open_count} /> open
              </Badge>
              <Badge tone="success">
                <AnimatedNumber value={d.risk_snapshot.closed_count} /> closed
              </Badge>
            </div>
            <p className="mt-3 text-xs text-text-tertiary">{d.risk_snapshot.note}</p>
          </CardContent>
        </MotionCard>
      </div>

      {/* Task completion trend */}
      <MotionCard>
        <CardHeader>
          <div>
            <CardTitle>Task Completion Trend</CardTitle>
            <CardDescription>Cumulative tasks due vs. completed, bucketed by due-date month</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {d.task_completion_trend.length === 0 ? (
            <EmptyState title="No due-dated tasks yet" description="Tasks need a due date to appear in this trend." />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                {/* Same rationale as BudgetTrendChart in the project detail page: "Completed" is the
                    genuinely cumulative-to-date series and earns the gradient-area treatment; "Due"
                    stays a flat dashed reference line rather than competing for the same visual weight. */}
                <ComposedChart data={d.task_completion_trend} margin={{ left: 0, right: 8 }}>
                  <defs>
                    <linearGradient id="taskCompletedFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--success-solid)" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="var(--success-solid)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" vertical={false} />
                  <XAxis dataKey="period" tick={{ fontSize: 11, fill: "var(--text-tertiary)" }} axisLine={{ stroke: "var(--border-default)" }} tickLine={false} minTickGap={16} />
                  <YAxis tick={{ fontSize: 11, fill: "var(--text-tertiary)" }} axisLine={false} tickLine={false} width={32} allowDecimals={false} />
                  <RTooltip contentStyle={tooltipStyle} />
                  <Line type="monotone" dataKey="tasks_due_cumulative" name="Due" stroke="var(--neutral-400)" strokeDasharray="4 4" strokeWidth={1.5} dot={false} />
                  <Area type="monotone" dataKey="tasks_completed_cumulative" name="Completed" stroke="var(--success-solid)" fill="url(#taskCompletedFill)" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="mt-3 flex items-center gap-4 text-xs text-text-tertiary">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-neutral-400" /> Tasks due</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: "var(--success-solid)" }} /> Tasks completed</span>
          </div>
        </CardContent>
      </MotionCard>
    </div>
  );
}
