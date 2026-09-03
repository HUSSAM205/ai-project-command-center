"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
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
import { FolderKanban, PlayCircle, CheckCircle2, AlertTriangle, Calendar, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useDashboardStream } from "@/lib/useDashboardStream";
import type { Project, ProjectStatus, Resource, Risk } from "@/lib/types";
import { MetricCard } from "@/components/ui/MetricCard";
import { MotionCard } from "@/components/ui/MotionCard";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { CardSkeleton } from "@/components/ui/LoadingState";
import { OfflinePreviewBanner } from "@/components/ui/OfflinePreviewBanner";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { HealthGauge } from "@/components/ui/StatusIndicator";
import { LiveIndicator } from "@/components/ui/LiveIndicator";
import { Badge, riskLevelTone, projectStatusTone, utilizationTone, AISourceBadge, QuickSummaryBadge, SOLID_COLORS } from "@/components/ui/Badge";
import { RiskRadar } from "@/components/viz/RiskRadar";
import { buildLocalExecutiveBrief } from "@/lib/localExecutiveBrief";
import { formatCompactCurrency, formatDate, formatPercent } from "@/lib/utils";
import { cardHover, crossFade, staggerContainer, staggerItem } from "@/lib/motion";
import {
  buildOfflineDashboard,
  buildOfflineProjects,
  buildOfflineRisks,
  buildOfflineResources,
  withOfflineFallback,
} from "@/lib/offlinePreview";

/** How long the real GET /api/v1/ai/executive-brief call gets before the honestly-labeled local
 * fallback (lib/localExecutiveBrief.ts) takes over the display. If the real response lands after
 * this, the swap already happened — arriving data still replaces the fallback via the crossfade
 * below, it just means the fallback was visible first. */
const EXECUTIVE_BRIEF_FALLBACK_DELAY_MS = 1000;

const EMPTY_PROJECTS: Project[] = [];
const EMPTY_RESOURCES: Resource[] = [];
const EMPTY_RISKS: (Risk & { project_name?: string })[] = [];

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
  const projects = useApi(() => withOfflineFallback(() => api.projects(), buildOfflineProjects), []);
  const resources = useApi(() => withOfflineFallback(() => api.resources(), buildOfflineResources), []);
  const brief = useApi(() => api.executiveBrief(), []);
  const allRisks = useApi(() => withOfflineFallback(() => api.allRisks(), buildOfflineRisks), []);

  const projectsList = projects.data?.data ?? EMPTY_PROJECTS;
  const resourcesList = resources.data?.data ?? EMPTY_RESOURCES;
  const allRisksList = allRisks.data?.data ?? EMPTY_RISKS;
  // A missing SSE/dashboard summary (dashboard.error) is the strongest signal the backend is
  // genuinely unreachable, not just one of these three secondary calls having a bad moment — so
  // that's what drives the single offline banner below, rather than each call's own flag.
  const dashboardOffline = !!dashboard.error && !dashboard.data;
  const d = dashboard.data ?? (dashboardOffline ? buildOfflineDashboard() : null);

  const worstHealthProjects = useMemo(() => {
    return [...projectsList].sort((a, b) => a.health_score - b.health_score).slice(0, 6);
  }, [projectsList]);

  // Executive Brief resilient fallback (Task 1): the real GET /api/v1/ai/executive-brief call is
  // the only AI-touching request on this page, and the only one that can be slow (rate-limit +
  // cache Redis round trips) or occasionally 502. `brief.loading` starts true and flips to false
  // once the call settles (success or failure) — this timer fires the fallback only if it's *still*
  // loading ~1s in; it's cleared/restarted whenever `brief.loading` toggles (mount, or a manual
  // `brief.reload()`), so a fast real response never shows the fallback at all.
  const [briefFallbackDue, setBriefFallbackDue] = useState(false);
  useEffect(() => {
    // Nothing to reset when loading ends: `showBriefFallback` below is also gated on `!brief.data`,
    // so once the real response lands this flag simply stops mattering — no need to flip it back to
    // false (which would mean calling setState synchronously from the effect body on every render
    // where loading is already false, rather than only from this timer's own callback).
    if (!brief.loading) return;
    const timer = setTimeout(() => setBriefFallbackDue(true), EXECUTIVE_BRIEF_FALLBACK_DELAY_MS);
    return () => clearTimeout(timer);
  }, [brief.loading]);

  // Grounded purely in data this page already fetched for other cards (GET /dashboard,
  // GET /projects) — see lib/localExecutiveBrief.ts. Recomputed only when that real data changes.
  const localBrief = useMemo(() => (d ? buildLocalExecutiveBrief(d, projectsList) : null), [d, projectsList]);

  // Show the fallback once it's due AND slow, OR immediately on an outright failure — either way,
  // never a red error box for this card (the "zero visible failure state" goal from the brief).
  const showBriefFallback = !brief.data && (briefFallbackDue || !!brief.error) && !!localBrief;

  const financialData = useMemo(() => {
    return projectsList.map((p) => ({ name: shortName(p.name), Budget: p.budget, Actual: p.actual_cost }));
  }, [projectsList]);

  const resourceCapacity = useMemo(() => {
    const buckets: Record<string, Resource[]> = { UNDERUTILIZED: [], OPTIMAL: [], OVERLOADED: [] };
    resourcesList.forEach((r) => buckets[r.utilization_state]?.push(r));
    return buckets;
  }, [resourcesList]);

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

  if (!d) {
    // useDashboardStream's own error only ever fires when it has *never* loaded anything at all
    // (see that hook's doc comment) — and buildOfflineDashboard() covers that case above, so
    // reaching here at all would mean something unexpected slipped through both. Kept as a real,
    // honest fallback rather than assumed unreachable.
    return (
      <ErrorState
        title="Couldn't load the dashboard"
        description={dashboard.error?.message}
        offline={dashboard.error?.message?.includes("offline")}
        onRetry={dashboard.reload}
      />
    );
  }

  const riskEntries = Object.entries(d.risk_counts ?? {}).filter(([, v]) => v > 0);
  const statusEntries = Object.entries(d.projects_by_status ?? {}).filter(([, v]) => v > 0) as [ProjectStatus, number][];

  return (
    <div className="ambient-glow space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="bg-gradient-to-r from-text-primary to-text-tertiary bg-clip-text text-xl font-semibold text-transparent">
            Portfolio Dashboard
          </h1>
          <p className="mt-1 text-sm text-text-tertiary">A real-time view across every active initiative.</p>
        </div>
        <LiveIndicator status={dashboard.status} className="mt-1" />
      </div>

      {dashboardOffline && <OfflinePreviewBanner onRetry={dashboard.reload} subject="portfolio data" />}

      {/* KPI row */}
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="show"
        className="grid grid-cols-2 gap-4 md:grid-cols-4"
      >
        <motion.div variants={staggerItem} whileHover={cardHover}>
          <MetricCard label="Total Projects" value={<AnimatedNumber value={d.total_projects} />} icon={<FolderKanban className="h-4 w-4" />} />
        </motion.div>
        <motion.div variants={staggerItem} whileHover={cardHover}>
          <MetricCard label="Active" value={<AnimatedNumber value={d.active_projects} />} icon={<PlayCircle className="h-4 w-4" />} />
        </motion.div>
        <motion.div variants={staggerItem} whileHover={cardHover}>
          <MetricCard label="Completed" value={<AnimatedNumber value={d.completed_projects} />} icon={<CheckCircle2 className="h-4 w-4" />} />
        </motion.div>
        <motion.div variants={staggerItem} whileHover={cardHover}>
          <MetricCard
            label="At Risk"
            value={<AnimatedNumber value={d.at_risk_projects} />}
            icon={<AlertTriangle className="h-4 w-4" />}
            deltaTone={d.at_risk_projects > 0 ? "critical" : "neutral"}
          />
        </motion.div>
        <motion.div variants={staggerItem} whileHover={cardHover}>
          <MetricCard label="Avg. Health Score" value={<AnimatedNumber value={d.avg_health_score} format={(n) => Math.round(n).toString()} />} hint="Portfolio-wide average" />
        </motion.div>
        <motion.div variants={staggerItem} whileHover={cardHover}>
          <MetricCard label="Budget Utilization" value={<AnimatedNumber value={d.budget_utilization_pct} format={(n) => formatPercent(n)} />} hint="Actual vs. total budget" />
        </motion.div>
        <motion.div variants={staggerItem} whileHover={cardHover}>
          <MetricCard label="Resource Utilization" value={<AnimatedNumber value={d.resource_utilization_pct} format={(n) => formatPercent(n)} />} hint="Allocated vs. capacity" />
        </motion.div>
        <motion.div variants={staggerItem} whileHover={cardHover}>
          <MetricCard
            label="Upcoming Deadlines"
            value={<AnimatedNumber value={d.upcoming_deadlines?.length ?? 0} />}
            icon={<Calendar className="h-4 w-4" />}
            hint="Next 30 days"
          />
        </motion.div>
      </motion.div>

      {/* Executive AI Brief — Demo AI mode by default (no live provider keys configured); the
          badge always reflects the real source, never implies a live model ran when it didn't. */}
      <MotionCard>
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-text-tertiary" aria-hidden="true" />
              Executive Brief
            </CardTitle>
            <CardDescription>AI-generated portfolio summary, grounded in your actual data</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {brief.data ? <AISourceBadge source={brief.data.source} /> : showBriefFallback ? <QuickSummaryBadge /> : null}
            <Link href="/app/ai-assistant" className="text-xs font-medium text-brand-700 hover:underline dark:text-brand-300">
              Ask a question
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {/* Never a spinner-forever or a red error box here: the real AI response wins whenever it
              arrives, the local fallback (lib/localExecutiveBrief.ts) covers slow (~1s+) or failed
              calls, and a genuinely late real response crossfades in over the fallback rather than
              snapping — respects prefers-reduced-motion globally via <MotionConfig> in app/layout.tsx. */}
          <AnimatePresence mode="wait" initial={false}>
            {brief.data ? (
              <motion.p
                key="real"
                variants={crossFade}
                initial="initial"
                animate="animate"
                exit="exit"
                className="whitespace-pre-line text-sm leading-relaxed text-text-secondary"
              >
                {brief.data.detail ?? brief.data.summary}
              </motion.p>
            ) : showBriefFallback && localBrief ? (
              <motion.p
                key="fallback"
                variants={crossFade}
                initial="initial"
                animate="animate"
                exit="exit"
                className="whitespace-pre-line text-sm leading-relaxed text-text-secondary"
              >
                {localBrief.detail}
              </motion.p>
            ) : (
              <motion.div key="loading" variants={crossFade} initial="initial" animate="animate" exit="exit" className="h-16 animate-pulse rounded-md bg-subtle" />
            )}
          </AnimatePresence>
        </CardContent>
      </MotionCard>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
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
                  <AnimatedNumber value={v} className="font-medium text-text-primary" />
                </li>
              ))}
            </ul>
          </CardContent>
        </MotionCard>

        {/* Risk categories — same risk register, a different lens (severity-weighted score by
            category rather than a count by severity bucket). Real data via api.allRisks(). */}
        <MotionCard>
          <CardHeader>
            <div>
              <CardTitle>Risk Categories</CardTitle>
              <CardDescription>Severity-weighted score by category</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <RiskRadar risks={allRisksList} />
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
                <AnimatedNumber value={d.total_actual_cost} format={(n) => formatCompactCurrency(n)} /> /{" "}
                <AnimatedNumber value={d.total_budget} format={(n) => formatCompactCurrency(n)} />
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
            {resourcesList.length === 0 ? (
              <EmptyState title="No resources yet" />
            ) : (
              <ul className="space-y-3">
                {(["OVERLOADED", "OPTIMAL", "UNDERUTILIZED"] as const).map((state) => (
                  <li key={state} className="flex items-center justify-between">
                    <Badge tone={utilizationTone(state)} dot>
                      {state}
                    </Badge>
                    <AnimatedNumber value={resourceCapacity[state]?.length ?? 0} className="text-sm font-medium text-text-primary" />
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
                  <AnimatedNumber value={v} className="font-medium text-text-primary" />
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

const tooltipStyle = {
  background: "var(--bg-surface-raised)",
  border: "1px solid var(--border-default)",
  borderRadius: 8,
  fontSize: 12,
  color: "var(--text-primary)",
};
