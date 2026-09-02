"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Activity, ShieldAlert, ShieldCheck } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type { AIProviderStatus, AIUsage } from "@/lib/types";
import { Drawer } from "./Drawer";
import { Button } from "./Button";
import { Badge, type SemanticTone } from "./Badge";
import { PulseDot } from "./PulseDot";
import { Spinner } from "./LoadingState";
import { EmptyState } from "./EmptyState";
import { AnimatedNumber } from "./AnimatedNumber";
import { softSpring, staggerContainerLoose, staggerItem } from "@/lib/motion";
import { formatPercent, cn } from "@/lib/utils";

const OPEN_EVENT = "aipcc:open-telemetry-drawer";
const POLL_MS = 20_000;

/** Icon-button trigger, mounted in the Topbar next to CommandBarTrigger — same decoupled
 * open-via-DOM-event pattern CommandBar.tsx uses, so the actual drawer (mounted once in
 * app/app/layout.tsx) doesn't need its open state prop-drilled through the app shell. */
export function TelemetryDrawerTrigger() {
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}
      aria-label="Open live telemetry"
      title="Live telemetry"
    >
      <Activity className="h-4 w-4" />
    </Button>
  );
}

function providerTone(p: AIProviderStatus): SemanticTone {
  if (!p.configured) return "neutral";
  if (p.circuit_open) return "critical";
  if (!p.available) return "warning";
  return "success";
}

function providerLabel(p: AIProviderStatus): string {
  if (!p.configured) return "Not configured";
  if (p.circuit_open) return "Circuit open";
  if (!p.available) return "Unavailable";
  return "Healthy";
}

type View = "providers" | "usage";

/**
 * Real-data-only telemetry: AI provider circuit-breaker status and recent request usage, straight
 * from GET /admin/ai-providers and /admin/ai-usage (backend/app/api/admin.py). Both require the
 * admin.access permission — a non-admin viewer gets a real 403, rendered here as an honest
 * "admin access required" state rather than a crash or a worked-around fetch.
 */
export function TelemetryDrawer() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("providers");
  const [providers, setProviders] = useState<AIProviderStatus[] | null>(null);
  const [usage, setUsage] = useState<AIUsage | null>(null);
  const [loading, setLoading] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

  useEffect(() => {
    function onOpenEvent() {
      setOpen(true);
    }
    window.addEventListener(OPEN_EVENT, onOpenEvent);
    return () => window.removeEventListener(OPEN_EVENT, onOpenEvent);
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [providerStatus, aiUsage] = await Promise.all([api.admin.aiProviders(), api.admin.aiUsage(24)]);
      setProviders(providerStatus);
      setUsage(aiUsage);
      setForbidden(false);
      setLastFetched(new Date());
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setForbidden(true);
      } else {
        setError(err instanceof ApiError ? err.message : "Failed to load telemetry.");
      }
    } finally {
      setLoading(false);
    }
  }

  // Fetch on open, then poll every 20s for a genuinely "live" drawer while it stays open — no
  // fetching at all while closed, and the interval is torn down on close/unmount.
  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- kicks off the fetch the moment the drawer opens
    load();
    const interval = setInterval(load, POLL_MS);
    return () => clearInterval(interval);
  }, [open]);

  return (
    <Drawer open={open} onClose={() => setOpen(false)} title="Live Telemetry" width="md">
      {forbidden ? (
        <EmptyState
          icon={<ShieldAlert className="h-8 w-8" />}
          title="Admin access required"
          description="Live telemetry (AI provider status and usage) is only visible to admin accounts. This session doesn't have the admin.access permission."
        />
      ) : error ? (
        <EmptyState
          icon={<ShieldAlert className="h-8 w-8" />}
          title="Couldn't load telemetry"
          description={error}
          action={
            <Button size="sm" onClick={load}>
              Retry
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div role="tablist" aria-label="Telemetry view" className="relative inline-flex rounded-md bg-subtle p-0.5 text-xs font-medium">
              {(["providers", "usage"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="tab"
                  aria-selected={view === v}
                  onClick={() => setView(v)}
                  className={cn(
                    "relative z-10 rounded-[5px] px-3 py-1.5 transition-colors",
                    view === v ? "text-text-primary" : "text-text-tertiary hover:text-text-secondary",
                  )}
                >
                  {/* Same spring layoutId-pill pattern as Sidebar.tsx's sidebar-active-pill —
                      reused here rather than reinvented for this new segmented control. */}
                  {view === v && (
                    <motion.span
                      layoutId="telemetry-view-pill"
                      transition={softSpring}
                      className="absolute inset-0 -z-10 rounded-[5px] bg-surface shadow-elevation-1"
                    />
                  )}
                  {v === "providers" ? "Providers" : "Usage (24h)"}
                </button>
              ))}
            </div>
            {loading && !providers ? null : (
              <Button variant="ghost" size="sm" onClick={load} loading={loading} disabled={loading}>
                Refresh
              </Button>
            )}
          </div>

          {loading && !providers && !usage ? (
            <div className="flex items-center justify-center py-16">
              <Spinner />
            </div>
          ) : view === "providers" ? (
            <ProvidersView providers={providers ?? []} />
          ) : (
            <UsageView usage={usage} />
          )}

          {lastFetched && (
            <p className="pt-1 text-[11px] text-text-tertiary">
              Last updated {lastFetched.toLocaleTimeString()} · refreshes every {POLL_MS / 1000}s while open
            </p>
          )}
        </div>
      )}
    </Drawer>
  );
}

function ProvidersView({ providers }: { providers: AIProviderStatus[] }) {
  if (providers.length === 0) return <EmptyState title="No providers reported" />;
  return (
    <motion.ul variants={staggerContainerLoose} initial="hidden" animate="show" className="space-y-2.5">
      {providers.map((p) => {
        const tone = providerTone(p);
        const healthy = tone === "success";
        return (
          <motion.li key={p.name} variants={staggerItem} className="rounded-md border border-border-default p-3.5">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-sm font-medium text-text-primary">
                {healthy ? <PulseDot tone="success" /> : <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-text-tertiary" aria-hidden="true" />}
                {p.name}
              </span>
              <Badge tone={tone}>{providerLabel(p)}</Badge>
            </div>
            <dl className="mt-2.5 grid grid-cols-2 gap-2 text-xs text-text-tertiary">
              <div className="flex justify-between gap-2">
                <dt>Consecutive failures</dt>
                <dd className="font-tabular font-medium text-text-secondary">
                  <AnimatedNumber value={p.consecutive_failures} />
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>Cooldown remaining</dt>
                <dd className="font-tabular font-medium text-text-secondary">
                  {p.cooldown_seconds_remaining !== null ? `${Math.round(p.cooldown_seconds_remaining)}s` : "—"}
                </dd>
              </div>
            </dl>
          </motion.li>
        );
      })}
    </motion.ul>
  );
}

function UsageView({ usage }: { usage: AIUsage | null }) {
  if (!usage) return <EmptyState title="No usage data" />;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-md border border-border-default p-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-text-tertiary">Requests</p>
          <AnimatedNumber value={usage.total_requests} className="mt-1 block text-lg font-semibold text-text-primary" />
        </div>
        <div className="rounded-md border border-border-default p-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-text-tertiary">Success rate</p>
          <AnimatedNumber
            value={usage.success_rate}
            format={(n) => formatPercent(n, 1)}
            className="mt-1 block text-lg font-semibold text-text-primary"
          />
        </div>
        <div className="rounded-md border border-border-default p-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-text-tertiary">Avg latency</p>
          <AnimatedNumber
            value={usage.avg_latency_ms}
            format={(n) => `${Math.round(n)}ms`}
            className="mt-1 block text-lg font-semibold text-text-primary"
          />
        </div>
      </div>

      <div>
        <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          By provider
        </h4>
        {usage.provider_breakdown.length === 0 ? (
          <EmptyState title="No requests in this window" />
        ) : (
          <motion.ul variants={staggerContainerLoose} initial="hidden" animate="show" className="divide-y divide-border-default rounded-md border border-border-default">
            {usage.provider_breakdown.map((row) => (
              <motion.li key={row.provider} variants={staggerItem} className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-sm">
                <span className="font-medium text-text-primary">{row.provider}</span>
                <span className="flex items-center gap-3 font-tabular text-xs text-text-tertiary">
                  <AnimatedNumber value={row.request_count} format={(n) => `${Math.round(n)} req`} />
                  <AnimatedNumber value={row.success_rate} format={(n) => formatPercent(n, 0)} />
                  <AnimatedNumber value={row.avg_latency_ms} format={(n) => `${Math.round(n)}ms`} />
                </span>
              </motion.li>
            ))}
          </motion.ul>
        )}
      </div>
      <p className="text-[11px] text-text-tertiary">
        Window: last {usage.window_hours}h, since {new Date(usage.since).toLocaleString()}.
      </p>
    </div>
  );
}
