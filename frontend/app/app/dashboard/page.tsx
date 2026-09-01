"use client";

import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { FolderKanban, PlayCircle, CheckCircle2, AlertTriangle, Calendar } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useDashboardStream } from "@/lib/useDashboardStream";
import type { ProjectStatus, Resource } from "@/lib/types";
import { MetricCard } from "@/components/ui/MetricCard";
import { MotionCard } from "@/components/ui/MotionCard";
import { CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { CardSkeleton } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { HealthGauge } from "@/components/ui/StatusIndicator";
import { LiveIndicator } from "@/components/ui/LiveIndicator";
import { Badge, riskLevelTone, projectStatusTone, utilizationTone, SOLID_COLORS } from "@/components/ui/Badge";
import { formatCompactCurrency, formatDate, formatPercent } from "@/lib/utils";
import { cardHover, staggerContainer, staggerItem } from "@/lib/motion";

const SEVERITY_COLORS: Record<string, string> = {
  LOW: SOLID_COLORS[riskLevelTone("LOW")],
  MEDIUM: SOLID_COLORS[riskLevelTone("MEDIUM")],
  HIGH: SOLID_COLORS[riskLevelTone("HIGH")],
  CRITICAL: SOLID_COLORS[riskLevelTone("CRITICAL")],
};

const STATUS_COLORS: Record<ProjectStatus, string> = {
  PLANNING: SOLID_COLORS[projectStatusTone("PLANNING")],
  ACTIVE: SOLID_COLORS[projectStatusTone("ACTIVE")],
  ON_HOLD: SOLID_COLORS[projectStatusTone("ON_HOLD")],
  AT_RISK: SOLID_COLORS[projectStatusTone("AT_RISK")],
  COMPLETED: SOLID_COLORS[projectStatusTone("COMPLETED")],
  CANCELLED: SOLID_COLORS[projectStatusTone("CANCELLED")],
};

export default function DashboardPage() {
  const dashboard = useDashboardStream();
  const projects = useApi(() => api.projects(), []);
  const resources = useApi(() => api.resources(), []);

  const worstHealthProjects = useMemo(() => {
    if (!projects.data) return [];
    return [...projects.data].sort((a, b) => a.health_score - b.health_score).slice(0, 6);
  }, [projects.data]);

  const financialData = useMemo(() => {
    if (!projects.data) return [];
    return projects.data.map((p) => ({ name: shortName(p.name), Budget: p.budget, Actual: p.actual_cost }));
  }, [projects.data]);

  const resourceCapacity = useMemo(() => {
    const buckets: Record<string, Resource[]> = { UNDERUTILIZED: [], OPTIMAL: [], OVERLOADED: [] };
    (resources.data ?? []).forEach((r) => buckets[r.utilization_state]?.push(r));
    return buckets;
  }, [resources.data]);

  if (dashboard.loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (dashboard.error || !dashboard.data) {
    return (
      <ErrorState
        title="Couldn't load the dashboard"
        description={dashboard.error?.message}
        offline={dashboard.error?.message?.includes("offline")}
        onRetry={dashboard.reload}
      />
    );
  }

  const d = dashboard.data;
  const riskEntries = Object.entries(d.risk_counts ?? {}).filter(([, v]) => v > 0);
  const statusEntries = Object.entries(d.projects_by_status ?? {}).filter(([, v]) => v > 0) as [ProjectStatus, number][];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Portfolio Dashboard</h1>
          <p className="mt-1 text-sm text-text-tertiary">A real-time view across every active initiative.</p>
        </div>
        <LiveIndicator status={dashboard.status} className="mt-1" />
      </div>

      {/* KPI row */}
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="show"
        className="grid grid-cols-2 gap-4 md:grid-cols-4"
      >
        <motion.div variants={staggerItem} whileHover={cardHover}>
          <MetricCard label="Total Projects" value={<AnimatedMetric value={d.total_projects} />} icon={<FolderKanban className="h-4 w-4" />} />
        </motion.div>
        <motion.div variants={staggerItem} whileHover={cardHover}>
          <MetricCard label="Active" value={<AnimatedMetric value={d.active_projects} />} icon={<PlayCircle className="h-4 w-4" />} />
        </motion.div>
        <motion.div variants={staggerItem} whileHover={cardHover}>
          <MetricCard label="Completed" value={<AnimatedMetric value={d.completed_projects} />} icon={<CheckCircle2 className="h-4 w-4" />} />
        </motion.div>
        <motion.div variants={staggerItem} whileHover={cardHover}>
          <MetricCard
            label="At Risk"
            value={<AnimatedMetric value={d.at_risk_projects} />}
            icon={<AlertTriangle className="h-4 w-4" />}
            deltaTone={d.at_risk_projects > 0 ? "critical" : "neutral"}
          />
        </motion.div>
        <motion.div variants={staggerItem} whileHover={cardHover}>
          <MetricCard label="Avg. Health Score" value={<AnimatedMetric value={Math.round(d.avg_health_score)} />} hint="Portfolio-wide average" />
        </motion.div>
        <motion.div variants={staggerItem} whileHover={cardHover}>
          <MetricCard label="Budget Utilization" value={<AnimatedMetric value={formatPercent(d.budget_utilization_pct)} />} hint="Actual vs. total budget" />
        </motion.div>
        <motion.div variants={staggerItem} whileHover={cardHover}>
          <MetricCard label="Resource Utilization" value={<AnimatedMetric value={formatPercent(d.resource_utilization_pct)} />} hint="Allocated vs. capacity" />
        </motion.div>
        <motion.div variants={staggerItem} whileHover={cardHover}>
          <MetricCard
            label="Upcoming Deadlines"
            value={<AnimatedMetric value={d.upcoming_deadlines?.length ?? 0} />}
            icon={<Calendar className="h-4 w-4" />}
            hint="Next 30 days"
          />
        </motion.div>
      </motion.div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Portfolio health */}
        <MotionCard className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Portfolio Health</CardTitle>
              <CardDescription>Lowest-scoring projects surfaced first</CardDescription>
            </div>
            <Link href="/app/projects" className="text-xs font-medium text-brand-700 hover:underline dark:text-brand-300">
              View all
            </Link>
          </CardHeader>
          <CardContent>
            {worstHealthProjects.length === 0 ? (
              <EmptyState title="No projects yet" />
            ) : (
              <motion.ul variants={staggerContainer} initial="hidden" animate="show" className="divide-y divide-border-default">
                {worstHealthProjects.map((p) => (
                  <motion.li key={p.id} variants={staggerItem} className="flex items-center gap-4 py-3">
                    <HealthGauge score={p.health_score} size={44} />
                    <div className="min-w-0 flex-1">
                      <Link href={`/app/projects/${p.id}`} className="truncate text-sm font-medium text-text-primary hover:underline">
                        {p.name}
                      </Link>
                      <p className="text-xs text-text-tertiary">{p.client ?? "Internal"}</p>
                    </div>
                    <Badge tone={riskLevelTone(p.risk_level)}>{p.risk_level}</Badge>
                  </motion.li>
                ))}
              </motion.ul>
            )}
          </CardContent>
        </MotionCard>

        {/* Risk landscape */}
        <MotionCard>
          <CardHeader>
            <div>
              <CardTitle>Risk Landscape</CardTitle>
              <CardDescription>Open risks by severity</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {riskEntries.length === 0 ? (
              <EmptyState title="No risks recorded" />
            ) : (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={riskEntries.map(([k, v]) => ({ name: k, value: v }))} dataKey="value" nameKey="name" innerRadius={44} outerRadius={68} paddingAngle={2}>
                      {riskEntries.map(([k]) => (
                        <Cell key={k} fill={SEVERITY_COLORS[k] ?? "var(--neutral-400)"} />
                      ))}
                    </Pie>
                    <RTooltip contentStyle={tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
            <ul className="mt-2 space-y-1.5">
              {riskEntries.map(([k, v]) => (
                <li key={k} className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-text-secondary">
                    <span className="h-2 w-2 rounded-full" style={{ background: SEVERITY_COLORS[k] }} />
                    {k}
                  </span>
                  <span className="font-tabular font-medium text-text-primary">{v}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </MotionCard>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Financial performance */}
        <MotionCard className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Financial Performance</CardTitle>
              <CardDescription>Budget vs. actual cost by project</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {financialData.length === 0 ? (
              <EmptyState title="No budget data yet" />
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={financialData} barGap={4}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--text-tertiary)" }} axisLine={{ stroke: "var(--border-default)" }} tickLine={false} />
                    <YAxis
                      tick={{ fontSize: 11, fill: "var(--text-tertiary)" }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => formatCompactCurrency(v)}
                      width={56}
                    />
                    <RTooltip contentStyle={tooltipStyle} formatter={(v) => formatCompactCurrency(Number(v))} />
                    <Bar dataKey="Budget" fill="var(--neutral-300)" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="Actual" fill="var(--brand-500)" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="mt-3 flex items-center gap-4 text-xs text-text-tertiary">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-neutral-300" /> Budget</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-brand-500" /> Actual</span>
              <span className="ml-auto font-tabular">
                {formatCompactCurrency(d.total_actual_cost)} / {formatCompactCurrency(d.total_budget)}
              </span>
            </div>
          </CardContent>
        </MotionCard>

        {/* Resource capacity */}
        <MotionCard>
          <CardHeader>
            <div>
              <CardTitle>Resource Capacity</CardTitle>
              <CardDescription>Utilization across the bench</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {(resources.data ?? []).length === 0 ? (
              <EmptyState title="No resources yet" />
            ) : (
              <ul className="space-y-3">
                {(["OVERLOADED", "OPTIMAL", "UNDERUTILIZED"] as const).map((state) => (
                  <li key={state} className="flex items-center justify-between">
                    <Badge tone={utilizationTone(state)} dot>
                      {state}
                    </Badge>
                    <span className="font-tabular text-sm font-medium text-text-primary">{resourceCapacity[state]?.length ?? 0}</span>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/app/resources" className="mt-4 inline-block text-xs font-medium text-brand-700 hover:underline dark:text-brand-300">
              View resource plan
            </Link>
          </CardContent>
        </MotionCard>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Upcoming deadlines */}
        <MotionCard className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Upcoming Deadlines</CardTitle>
            <CardDescription>Tasks and milestones due soon</CardDescription>
          </CardHeader>
          <CardContent>
            {(d.upcoming_deadlines ?? []).length === 0 ? (
              <EmptyState title="Nothing due soon" />
            ) : (
              <ul className="divide-y divide-border-default">
                {d.upcoming_deadlines.map((item) => (
                  <li key={`${item.type}-${item.id}`} className="flex items-center justify-between py-2.5 text-sm">
                    <span className="flex items-center gap-2 text-text-primary">
                      <Badge tone="neutral">{item.type}</Badge>
                      {item.name}
                    </span>
                    <span className="font-tabular text-text-tertiary">{formatDate(item.due_date)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </MotionCard>

        {/* Projects by status */}
        <MotionCard>
          <CardHeader>
            <div>
              <CardTitle>Projects by Status</CardTitle>
              <CardDescription>Current portfolio mix</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {statusEntries.length === 0 ? (
              <EmptyState title="No projects yet" />
            ) : (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={statusEntries.map(([k, v]) => ({ name: k, value: v }))} dataKey="value" nameKey="name" innerRadius={44} outerRadius={68} paddingAngle={2}>
                      {statusEntries.map(([k]) => (
                        <Cell key={k} fill={STATUS_COLORS[k] ?? "var(--neutral-400)"} />
                      ))}
                    </Pie>
                    <RTooltip contentStyle={tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
            <ul className="mt-2 space-y-1.5">
              {statusEntries.map(([k, v]) => (
                <li key={k} className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-text-secondary">
                    <span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLORS[k] }} />
                    {k.replace("_", " ")}
                  </span>
                  <span className="font-tabular font-medium text-text-primary">{v}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </MotionCard>
      </div>
    </div>
  );
}

function shortName(name: string) {
  return name.length > 16 ? name.slice(0, 15) + "…" : name;
}

/** Cross-fades in a new value in place — used so live SSE/polling updates don't jump-cut. */
function AnimatedMetric({ value }: { value: ReactNode }) {
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.span
        key={String(value)}
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 6 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className="inline-block"
      >
        {value}
      </motion.span>
    </AnimatePresence>
  );
}

const tooltipStyle = {
  background: "var(--bg-surface-raised)",
  border: "1px solid var(--border-default)",
  borderRadius: 8,
  fontSize: 12,
  color: "var(--text-primary)",
};
