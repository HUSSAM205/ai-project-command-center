"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { FolderKanban, PlayCircle, CheckCircle2, AlertTriangle, Sparkles, Orbit } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useDashboardStream } from "@/lib/useDashboardStream";
import { useLanguage } from "@/lib/i18n";
import type { Project, ProjectStatus, Resource, Risk } from "@/lib/types";
import { MotionCard } from "@/components/ui/MotionCard";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { CardSkeleton } from "@/components/ui/LoadingState";
import { OfflinePreviewBanner } from "@/components/ui/OfflinePreviewBanner";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { HealthGauge } from "@/components/ui/StatusIndicator";
import { LiveIndicator } from "@/components/ui/LiveIndicator";
import { PulseDot } from "@/components/ui/PulseDot";
import { Badge, riskLevelTone, ragStatusTone, projectStatusTone, utilizationTone, AISourceBadge, QuickSummaryBadge, SOLID_COLORS } from "@/components/ui/Badge";
import { RiskRadar } from "@/components/viz/RiskRadar";
import { buildLocalExecutiveBrief } from "@/lib/localExecutiveBrief";
import { cn, formatCompactCurrency, formatDate, formatPercent } from "@/lib/utils";
import { crossFade, staggerContainer, staggerItem } from "@/lib/motion";
import {
  buildOfflineDashboard,
  buildOfflineProjects,
  buildOfflineRisks,
  buildOfflineResources,
  withOfflineFallback,
} from "@/lib/offlinePreview";

// WebGL has no server-side representation, so both 3D visualizations load client-only. `loading`
// reserves their real footprint (a fixed height matching the component's own `h-80`/`h-40`) so
// the page never jumps once the dynamic import resolves.
const ProjectConstellation3D = dynamic(() => import("@/components/viz/ProjectConstellation3D"), {
  ssr: false,
  loading: () => <div className="h-80 w-full animate-pulse rounded-lg bg-subtle" />,
});
const RiskHealthRings3D = dynamic(() => import("@/components/viz/RiskHealthRings3D"), {
  ssr: false,
  loading: () => <div className="h-40 w-full animate-pulse rounded-lg bg-subtle" />,
});

/** How long the real GET /api/v1/ai/executive-brief call gets before the honestly-labeled local
 * fallback (lib/localExecutiveBrief.ts) takes over the display. If the real response lands after
 * this, the swap already happened — arriving data still replaces the fallback via the crossfade
 * below, it just means the fallback was visible first. */
const EXECUTIVE_BRIEF_FALLBACK_DELAY_MS = 1000;

const EMPTY_PROJECTS: Project[] = [];
const EMPTY_RESOURCES: Resource[] = [];
const EMPTY_RISKS: (Risk & { project_name?: string })[] = [];

const RAG_BAR_FILL: Record<string, string> = {
  ON_TRACK: "bg-success-solid",
  AT_RISK: "bg-warning-solid",
  CRITICAL: "bg-critical-solid",
  COMPLETED: "bg-info-solid",
};

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
  const { t } = useLanguage();
  const dashboard = useDashboardStream();
  // Default OFF: this is a live executive cockpit first, and the 3D constellation/risk-ring
  // views are a deliberate secondary "deep analysis" mode, never the primary landing surface —
  // see the Portfolio Constellation card's comment below for the full reasoning.
  const [spatialView, setSpatialView] = useState(false);
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

  // Same health_score field every project row already carries, just re-sorted into a curve shape
  // (low to high) instead of a list — no new metric, only a different lens on it for Card A below.
  const healthCurve = useMemo(() => {
    return [...projectsList]
      .sort((a, b) => a.health_score - b.health_score)
      .map((p, i) => ({ rank: i + 1, score: p.health_score }));
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

  // Real, deterministic Planned Value recognition curve for the whole portfolio -- NOT a
  // historical record (this schema stores no EVM time series; every EVM figure anywhere in this
  // app is computed fresh from current data, see docs/ENTERPRISE_ARCHITECTURE_SPEC.md). At any
  // sampled date t, portfolio PV(t) = sum over projects of budget_i * clamp((t-start_i)/
  // (end_i-start_i), 0, 1) -- the same linear-schedule assumption app/services/common.py's
  // compute_planned_pct uses per-project, just summed across the portfolio and sampled across
  // its real date range instead of evaluated once at today.
  const portfolioTrajectory = useMemo(() => {
    const withDates = projectsList.filter((p) => p.start_date && p.end_date);
    if (withDates.length === 0) return { points: [] as { date: string; plannedValue: number }[], todayIndex: -1 };
    const starts = withDates.map((p) => new Date(p.start_date!).getTime());
    const ends = withDates.map((p) => new Date(p.end_date!).getTime());
    const minTime = Math.min(...starts);
    const maxTime = Math.max(...ends);
    const span = Math.max(1, maxTime - minTime);
    const SAMPLE_COUNT = 12;
    // "Today" is only used to pick the nearest sample point for a ReferenceDot label -- a few
    // minutes' staleness between reloads is irrelevant here, not a correctness concern the
    // purity rule is meant to guard against.
    // eslint-disable-next-line react-hooks/purity
    const now = Date.now();
    let todayIndex = -1;
    const points = Array.from({ length: SAMPLE_COUNT + 1 }, (_, i) => {
      const t = minTime + (span * i) / SAMPLE_COUNT;
      if (todayIndex === -1 && t >= now) todayIndex = i;
      const plannedValue = withDates.reduce((sum, p) => {
        const s = new Date(p.start_date!).getTime();
        const e = new Date(p.end_date!).getTime();
        const frac = e > s ? Math.min(1, Math.max(0, (t - s) / (e - s))) : t >= s ? 1 : 0;
        return sum + frac * p.budget;
      }, 0);
      return { date: new Date(t).toISOString().slice(0, 10), plannedValue };
    });
    return { points, todayIndex: todayIndex === -1 ? points.length - 1 : todayIndex };
  }, [projectsList]);

  const overallocatedResources = useMemo(
    () => resourcesList.filter((r) => r.utilization_state === "OVERLOADED").sort((a, b) => b.current_workload_hours_per_week - a.current_workload_hours_per_week),
    [resourcesList],
  );

  const ragCounts = useMemo(() => {
    const counts: Record<string, number> = { ON_TRACK: 0, AT_RISK: 0, CRITICAL: 0, COMPLETED: 0 };
    for (const p of projectsList) counts[p.rag_status] = (counts[p.rag_status] ?? 0) + 1;
    return counts;
  }, [projectsList]);

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
            {t("pageDashboardTitle")}
          </h1>
          <p className="mt-1 text-sm text-text-tertiary">A real-time view across every active initiative.</p>
        </div>
        <div className="mt-1 flex items-center gap-3">
          {dashboardOffline && <OfflinePreviewBanner onRetry={dashboard.reload} subject="portfolio data" inline />}
          <button
            type="button"
            onClick={() => setSpatialView((v) => !v)}
            aria-pressed={spatialView}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              spatialView
                ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-950/30 dark:text-brand-300"
                : "border-border-default bg-subtle text-text-tertiary hover:text-text-primary",
            )}
          >
            <Orbit className="h-3.5 w-3.5" aria-hidden="true" />
            Spatial View
          </button>
          <LiveIndicator status={dashboard.status} />
        </div>
      </div>

      {d && <PortfolioEvmCockpit evm={d.portfolio_evm} trajectory={portfolioTrajectory} />}

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

      {/* Portfolio constellation — a secondary "Spatial View" lens on the same projects/risks
          data as the rest of this page, OFF by default. This is a live executive cockpit first:
          the default landing view is the 2D KPI/table/chart layer below, and the 3D scene is an
          opt-in deep-analysis tool, never the primary surface. Node height = real health_score,
          node size = real budget, node color = the same risk_level mapping the Badge uses
          everywhere else. Edges connect projects sharing an open risk category — the only real
          cross-project relationship this app's data model has (task dependencies only link tasks
          within one project); deliberately not labeled "blockers" or "dependencies" since that
          data doesn't exist here. */}
      {spatialView && projectsList.length > 0 && (
        <MotionCard>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-1.5">
                <Orbit className="h-4 w-4 text-text-tertiary" aria-hidden="true" />
                Portfolio Constellation
              </CardTitle>
              <CardDescription>
                Height = health score, size = budget, color = risk level. Lines connect projects sharing an open risk
                category. Hover or click a node for details.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <ProjectConstellation3D projects={projectsList} risks={allRisksList} />
          </CardContent>
        </MotionCard>
      )}

      {/* Bento grid — same four data sources the old flat KPI/card rows used (projects, risks,
          resources, budget), just regrouped by subject into asymmetric cells instead of a uniform
          stack of same-size boxes. No new fetch, no new computation. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        {/* Card A — Portfolio health & status */}
        <MotionCard className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Enterprise Health &amp; Status</CardTitle>
              <CardDescription>Score distribution across every active initiative</CardDescription>
            </div>
            <Link href="/app/projects" className="text-xs font-medium text-brand-700 hover:underline dark:text-brand-300">
              View all
            </Link>
          </CardHeader>
          <CardContent>
            {/* @container: this card spans half the viewport at lg+ (lg:col-span-2 above), so a
                viewport-relative sm:/md: breakpoint here would flip to 5 columns while the card
                itself is still narrow — exactly the collision this container query avoids by
                sizing off the card's own width instead. */}
            <div className="@container">
              <div className="grid grid-cols-2 gap-2 @xs:grid-cols-3 @lg:grid-cols-5 sm:gap-3">
                <StatChip label="Total" value={<AnimatedNumber value={d.total_projects} />} icon={<FolderKanban className="h-3.5 w-3.5" />} />
                <StatChip label="Active" value={<AnimatedNumber value={d.active_projects} />} icon={<PlayCircle className="h-3.5 w-3.5" />} />
                <StatChip label="Completed" value={<AnimatedNumber value={d.completed_projects} />} icon={<CheckCircle2 className="h-3.5 w-3.5" />} />
                <StatChip
                  label="At Risk"
                  value={<AnimatedNumber value={d.at_risk_projects} />}
                  icon={<AlertTriangle className="h-3.5 w-3.5" />}
                  tone={d.at_risk_projects > 0 ? "critical" : "neutral"}
                  live={d.at_risk_projects > 0}
                />
                <StatChip label="Avg. Health" value={<AnimatedNumber value={d.avg_health_score} format={(n) => Math.round(n).toString()} />} />
              </div>
            </div>

            {healthCurve.length > 1 && (
              <div className="mt-4 h-20">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={healthCurve} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="healthCurveFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--brand-500)" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="var(--brand-500)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <YAxis hide domain={[0, 100]} />
                    <RTooltip contentStyle={tooltipStyle} labelFormatter={() => "Health score"} formatter={(v) => [String(v), "Score"]} />
                    <Area type="monotone" dataKey="score" stroke="var(--brand-500)" strokeWidth={2} fill="url(#healthCurveFill)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}

            <div className="mt-4 border-t border-border-default pt-3">
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
                      <Badge tone={ragStatusTone(p.rag_status)} dot>
                        {p.rag_status.replace("_", " ")}
                      </Badge>
                    </motion.li>
                  ))}
                </motion.ul>
              )}
            </div>
          </CardContent>
        </MotionCard>

        {/* Card B — Risk metrics & containment */}
        <MotionCard>
          <CardHeader>
            <div>
              <CardTitle>Risk Metrics &amp; Containment</CardTitle>
              <CardDescription>Open register by severity and category</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <StatChip
              label="Open Risks"
              value={<AnimatedNumber value={riskEntries.reduce((s, [, v]) => s + v, 0)} />}
              tone={riskEntries.some(([k]) => k === "CRITICAL") ? "critical" : "neutral"}
              live={riskEntries.some(([k]) => k === "CRITICAL")}
              className="mb-3"
            />
            {(ragCounts.ON_TRACK + ragCounts.AT_RISK + ragCounts.CRITICAL + ragCounts.COMPLETED) > 0 && (
              <div className="mb-4">
                <p className="mb-1 text-xs font-medium text-text-tertiary">RAG distribution</p>
                <div className="flex h-2 w-full overflow-hidden rounded-full bg-inset">
                  {(["ON_TRACK", "AT_RISK", "CRITICAL", "COMPLETED"] as const).map((k) => {
                    const total = ragCounts.ON_TRACK + ragCounts.AT_RISK + ragCounts.CRITICAL + ragCounts.COMPLETED;
                    const pct = total > 0 ? (ragCounts[k] / total) * 100 : 0;
                    if (pct === 0) return null;
                    return <div key={k} className={cn("h-full", RAG_BAR_FILL[k])} style={{ width: `${pct}%` }} title={`${k.replace("_", " ")}: ${ragCounts[k]}`} />;
                  })}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-text-tertiary">
                  <span>{ragCounts.ON_TRACK} on track</span>
                  <span>{ragCounts.AT_RISK} at risk</span>
                  <span>{ragCounts.CRITICAL} critical</span>
                  <span>{ragCounts.COMPLETED} completed</span>
                </div>
              </div>
            )}
            {riskEntries.length === 0 ? (
              <EmptyState title="No risks recorded" />
            ) : spatialView ? (
              <RiskHealthRings3D entries={riskEntries} />
            ) : (
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={riskEntries.map(([k, v]) => ({ name: k, value: v }))}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={38}
                      outerRadius={58}
                      paddingAngle={3}
                      cornerRadius={6}
                      stroke="var(--bg-surface)"
                      strokeWidth={2}
                    >
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

            {/* Same risk register, a different lens (severity-weighted score by category rather
                than a count by severity bucket). Real data via api.allRisks(). */}
            <div className="mt-4 border-t border-border-default pt-3">
              <p className="mb-1 text-xs font-medium text-text-tertiary">By category</p>
              <RiskRadar risks={allRisksList} />
            </div>
          </CardContent>
        </MotionCard>

        {/* Card C — Resource capacity & allocation */}
        <MotionCard>
          <CardHeader>
            <div>
              <CardTitle>Resource Capacity &amp; Allocation</CardTitle>
              <CardDescription>Utilization across the bench</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <StatChip
              label="Resource Utilization"
              value={<AnimatedNumber value={d.resource_utilization_pct} format={(n) => formatPercent(n)} />}
              className="mb-4"
            />
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
            {overallocatedResources.length > 0 && (
              <div className="mt-4 border-t border-border-default pt-3">
                <p className="mb-1.5 text-xs font-medium text-text-tertiary">Overallocated ({">"}100%)</p>
                <ul className="space-y-1.5">
                  {overallocatedResources.slice(0, 5).map((r) => (
                    <li key={r.id} className="flex items-center justify-between text-xs">
                      <span className="text-text-secondary">
                        {r.name} <span className="text-text-tertiary">· {r.role}</span>
                      </span>
                      <span className="font-tabular font-semibold text-critical-fg">
                        {Math.round((r.current_workload_hours_per_week / (r.capacity_hours_per_week || 1)) * 100)}%
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <Link href="/app/resources" className="mt-4 inline-block text-xs font-medium text-brand-700 hover:underline dark:text-brand-300">
              View resource plan
            </Link>
          </CardContent>
        </MotionCard>

        {/* Card D — Financial performance, full width bottom tier */}
        <MotionCard className="lg:col-span-4">
          <CardHeader>
            <div>
              <CardTitle>Financial Performance</CardTitle>
              <CardDescription>Budget vs. actual cost by project, portfolio-wide</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <StatChip label="Budget Utilization" value={<AnimatedNumber value={d.budget_utilization_pct} format={(n) => formatPercent(n)} />} />
              <StatChip label="Total Actual" value={<AnimatedNumber value={d.total_actual_cost} format={(n) => formatCompactCurrency(n)} />} />
              <StatChip label="Total Budget" value={<AnimatedNumber value={d.total_budget} format={(n) => formatCompactCurrency(n)} />} />
            </div>
            {financialData.length === 0 ? (
              <EmptyState title="No budget data yet" />
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={financialData} barGap={4}>
                    <defs>
                      <linearGradient id="dashBarBudget" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--neutral-300)" stopOpacity={0.9} />
                        <stop offset="100%" stopColor="var(--neutral-300)" stopOpacity={0.35} />
                      </linearGradient>
                      <linearGradient id="dashBarActual" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--brand-500)" stopOpacity={1} />
                        <stop offset="100%" stopColor="var(--brand-500)" stopOpacity={0.4} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--text-tertiary)" }} axisLine={{ stroke: "var(--border-default)" }} tickLine={false} />
                    <YAxis
                      tick={{ fontSize: 11, fill: "var(--text-tertiary)" }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => formatCompactCurrency(v)}
                      width={56}
                    />
                    <RTooltip cursor={{ fill: "var(--brand-500)", opacity: 0.06 }} contentStyle={tooltipStyle} formatter={(v) => formatCompactCurrency(Number(v))} />
                    <Bar dataKey="Budget" fill="url(#dashBarBudget)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Actual" fill="url(#dashBarActual)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="mt-3 flex items-center gap-4 text-xs text-text-tertiary">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-neutral-300" /> Budget</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-brand-500" /> Actual</span>
            </div>
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
                    <Pie data={statusEntries.map(([k, v]) => ({ name: k, value: v }))} dataKey="value" nameKey="name" innerRadius={44} outerRadius={68} paddingAngle={3} cornerRadius={6} stroke="var(--bg-surface)" strokeWidth={2}>
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

function evmTone(delta: number): "success" | "critical" {
  return delta >= 0 ? "success" : "critical";
}

/** 6 real, computed portfolio-wide EVM tiles (backend/app/api/dashboard.py's portfolio_evm,
 * summed from every project's own real compute_evm() result -- never a separately-invented
 * portfolio formula) plus a real Planned-Value recognition curve. No tile carries a trend
 * sparkline: this schema stores no EVM time series anywhere (every EVM figure is computed fresh
 * from current data, see docs/ENTERPRISE_ARCHITECTURE_SPEC.md), so a sparkline here would have to
 * be fabricated history. "Delta vs target" instead compares against a real, fixed reference
 * (0 for SV/CV, 1.0 for CPI) rather than a fake prior value. */
function PortfolioEvmCockpit({
  evm,
  trajectory,
}: {
  evm: import("@/lib/types").PortfolioEVM;
  trajectory: { points: { date: string; plannedValue: number }[]; todayIndex: number };
}) {
  const tiles: { label: string; value: string; delta?: string; tone?: "success" | "critical" }[] = [
    { label: "Capital Deployed", value: formatCompactCurrency(evm.bac) },
    { label: "Actual Cost Accrued", value: formatCompactCurrency(evm.ac), delta: `${((evm.ac / (evm.bac || 1)) * 100).toFixed(0)}% of capital` },
    { label: "Schedule Variance", value: formatCompactCurrency(evm.sv), delta: "vs. 0 (on-plan)", tone: evmTone(evm.sv) },
    { label: "Cost Variance", value: formatCompactCurrency(evm.cv), delta: "vs. 0 (on-plan)", tone: evmTone(evm.cv) },
    {
      label: "Portfolio CPI",
      value: evm.cpi !== null ? evm.cpi.toFixed(2) : "—",
      delta: evm.cpi !== null ? `${evm.cpi >= 1 ? "+" : ""}${(evm.cpi - 1).toFixed(2)} vs 1.00 target` : undefined,
      tone: evm.cpi !== null ? evmTone(evm.cpi - 1) : undefined,
    },
    {
      label: "Critical Exposure",
      value: formatCompactCurrency(evm.critical_exposure),
      delta: `${((evm.critical_exposure / (evm.bac || 1)) * 100).toFixed(0)}% of capital, ${evm.project_count} programs`,
      tone: evm.critical_exposure > 0 ? "critical" : "success",
    },
  ];

  const toneClass: Record<string, string> = {
    success: "text-success-fg",
    critical: "text-critical-fg",
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-lg border border-border-default bg-surface p-3.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-text-tertiary">{tile.label}</p>
            <p className="mt-1 font-tabular text-lg font-semibold text-text-primary">{tile.value}</p>
            {tile.delta && <p className={cn("mt-0.5 font-tabular text-[11px]", tile.tone ? toneClass[tile.tone] : "text-text-tertiary")}>{tile.delta}</p>}
          </div>
        ))}
      </div>

      {trajectory.points.length > 0 && (
        <MotionCard>
          <CardHeader>
            <div>
              <CardTitle>Financial Trajectory</CardTitle>
              <CardDescription>
                Planned Value recognition curve computed from real project schedules — today&apos;s actual EV/AC marked. Not a
                historical record; this deployment stores no EVM time series.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trajectory.points} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border-default" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} minTickGap={30} />
                <YAxis tickFormatter={(v) => formatCompactCurrency(v)} tick={{ fontSize: 10 }} width={56} />
                <RTooltip formatter={(v) => formatCompactCurrency(Number(v))} />
                <Line type="monotone" dataKey="plannedValue" name="Planned Value" stroke="var(--color-info-fg)" strokeWidth={2} dot={false} />
                {trajectory.todayIndex >= 0 && (
                  <ReferenceDot
                    x={trajectory.points[trajectory.todayIndex]?.date}
                    y={evm.ev}
                    r={5}
                    fill="var(--color-success-fg)"
                    stroke="none"
                    label={{ value: `Today: EV ${formatCompactCurrency(evm.ev)} / AC ${formatCompactCurrency(evm.ac)}`, fontSize: 10, position: "top" }}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </MotionCard>
      )}
    </div>
  );
}

// Compact stat readout for a bento cell's header area — deliberately lighter than MetricCard
// (no border/blur/shadow of its own) since it lives inside a card that already has those.
function StatChip({
  label,
  value,
  icon,
  tone = "neutral",
  live = false,
  className,
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
  tone?: "critical" | "neutral";
  // Telemetry accent (globals.css's .telemetry-accent): a slow sweeping ring, reserved for a
  // stat that genuinely warrants a second look right now (e.g. "At Risk" > 0, a critical risk
  // present) — never applied uniformly, or the accent stops meaning anything.
  live?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative min-w-0 rounded-lg border border-border-default/60 bg-subtle/70 px-2.5 py-2 sm:px-3",
        live && "telemetry-accent",
        className,
      )}
      style={live ? ({ "--telemetry-tone": "var(--critical-solid)" } as React.CSSProperties) : undefined}
    >
      <div className="flex min-w-0 items-center gap-1.5 text-text-tertiary">
        {icon}
        <p className="min-w-0 truncate text-[11px] font-medium uppercase tracking-wide">{label}</p>
        {live && <PulseDot tone="critical" className="ms-auto" />}
      </div>
      <p className={cn("mt-0.5 truncate font-tabular text-lg font-semibold", tone === "critical" ? "text-critical-fg" : "text-text-primary")}>{value}</p>
    </div>
  );
}

const tooltipStyle = {
  background: "var(--bg-surface-raised)",
  border: "1px solid var(--border-default)",
  borderRadius: 10,
  fontSize: 12,
  color: "var(--text-primary)",
  boxShadow: "var(--shadow-elevation-2)",
};
