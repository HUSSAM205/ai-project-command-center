"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Cpu, Database, FileSearch, Network, ShieldAlert, Sparkles } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Badge, type SemanticTone } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/LoadingState";
import { MetricCard } from "@/components/ui/MetricCard";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { PulseDot } from "@/components/ui/PulseDot";
import { staggerContainerLoose, staggerItem, fadeSlideUp } from "@/lib/motion";
import { formatPercent, formatBytes, titleCase, cn } from "@/lib/utils";
import type { AIProviderStatus, AIUsage, Document, DocumentStatus } from "@/lib/types";

/**
 * "AI Solution Architect" workspace — a curated, read-only aggregation of real data already
 * served elsewhere in the app (see docs/AI_ARCHITECTURE.md, TelemetryDrawer, GET /api/v1/documents).
 * Nothing here is a new data source: the pipeline diagram is a static explainer of the real
 * document-intelligence flow, and the telemetry/document stats below it are the same live numbers
 * TelemetryDrawer and the Documents page already show, just curated for an architect's view.
 */
export default function ArchitectWorkspacePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">AI Solution Architect</h1>
        <p className="mt-1 text-sm text-text-tertiary">
          How this app&apos;s document intelligence and AI router actually work, plus the real telemetry behind them.
        </p>
      </div>

      <PipelineDiagram />
      <AIRouterTelemetry />
      <DocumentIntelligenceStats />
    </div>
  );
}

/* ---------------------------------------------------------------------------------------------
 * Pipeline diagram — static, illustrative, not live data. Every label below is grounded in the
 * real implementation: backend/app/services/document_chunking.py (500-char chunks, 75 overlap),
 * backend/app/services/embeddings.py (sentence-transformers all-MiniLM-L6-v2, 384-dim, local/CPU,
 * no API key), backend/app/api/documents.py (cosine-similarity top-k retrieval for /ask), and
 * backend/app/ai/router.py (the 4-tier Gemini -> Groq -> cache -> Demo AI fallback chain — see
 * docs/AI_ARCHITECTURE.md). This box-and-arrow diagram is deliberately plain HTML/CSS, not a
 * live-data flow visualization.
 * ------------------------------------------------------------------------------------------- */
const STAGES: { title: string; icon: React.ReactNode; detail: string; source: string }[] = [
  {
    title: "Data Ingestion",
    icon: <FileSearch className="h-5 w-5" />,
    detail: "PDF/DOCX/TXT upload, parsed to plain text server-side",
    source: "app/api/documents.py",
  },
  {
    title: "Chunking / Embedding",
    icon: <Database className="h-5 w-5" />,
    detail: "500-char sliding-window chunks (75-char overlap) -> 384-dim vectors (all-MiniLM-L6-v2, local CPU)",
    source: "document_chunking.py, embeddings.py",
  },
  {
    title: "Vector Retrieval",
    icon: <Network className="h-5 w-5" />,
    detail: "Cosine similarity over a document's stored chunk vectors, top-k passed as context",
    source: "app/api/documents.py::ask",
  },
  {
    title: "LLM Router",
    icon: <Cpu className="h-5 w-5" />,
    detail: "Gemini -> Groq -> Redis cache -> Demo AI, first success wins, circuit breaker per provider",
    source: "app/ai/router.py",
  },
  {
    title: "Response",
    icon: <Sparkles className="h-5 w-5" />,
    detail: "AIResponse { summary, detail, confidence, source, data } — source always honest",
    source: "app/schemas/ai.py",
  },
];

function PipelineDiagram() {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Document Intelligence Pipeline</CardTitle>
          <CardDescription>
            A static, illustrative explainer of the real architecture — not a live-data flow. See docs/AI_ARCHITECTURE.md.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch">
          {STAGES.map((stage, i) => (
            <div key={stage.title} className="flex flex-1 items-center gap-3">
              <div className="flex flex-1 flex-col rounded-lg border border-border-default bg-subtle/40 p-4">
                <div className="flex items-center gap-2 text-brand-700 dark:text-brand-300">
                  {stage.icon}
                  <span className="text-sm font-semibold text-text-primary">{stage.title}</span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-text-secondary">{stage.detail}</p>
                <p className="mt-2 font-tabular text-[10px] uppercase tracking-wide text-text-tertiary">{stage.source}</p>
              </div>
              {i < STAGES.length - 1 && (
                <ArrowRight className="hidden h-5 w-5 shrink-0 text-text-tertiary lg:block" aria-hidden="true" />
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/* ---------------------------------------------------------------------------------------------
 * AI Router Telemetry — same real data source as components/ui/TelemetryDrawer.tsx
 * (GET /api/v1/admin/ai-providers, GET /api/v1/admin/ai-usage). Admin-gated; a non-admin/demo
 * session gets a real 403, rendered honestly here rather than crashing, same pattern the drawer
 * already uses.
 * ------------------------------------------------------------------------------------------- */
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

function AIRouterTelemetry() {
  const [providers, setProviders] = useState<AIProviderStatus[] | null>(null);
  const [usage, setUsage] = useState<AIUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [providerStatus, aiUsage] = await Promise.all([api.admin.aiProviders(), api.admin.aiUsage(24)]);
      setProviders(providerStatus);
      setUsage(aiUsage);
      setForbidden(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setForbidden(true);
      } else {
        setError(err instanceof ApiError ? err.message : "Failed to load AI router telemetry.");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- kicks off the fetch on mount, same pattern as TelemetryDrawer.tsx
    load();
  }, []);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>AI Router Telemetry</CardTitle>
          <CardDescription>
            Real circuit-breaker state and request volume from the last 24h — the same source TelemetryDrawer uses.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {forbidden ? (
          <EmptyState
            icon={<ShieldAlert className="h-8 w-8" />}
            title="Admin access required"
            description="AI router telemetry (provider status and usage) is only visible to admin accounts. This session doesn't have the admin.access permission."
          />
        ) : error ? (
          <ErrorState description={error} onRetry={load} />
        ) : loading && !providers ? (
          <div className="flex items-center justify-center py-12">
            <Spinner />
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <MetricCard label="Requests (24h)" value={<AnimatedNumber value={usage?.total_requests ?? 0} />} />
              <MetricCard
                label="Success rate"
                value={<AnimatedNumber value={usage?.success_rate ?? 0} format={(n) => formatPercent(n, 1)} />}
              />
              <MetricCard
                label="Avg latency"
                value={<AnimatedNumber value={usage?.avg_latency_ms ?? 0} format={(n) => `${Math.round(n)}ms`} />}
              />
            </div>

            <div>
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                Providers &amp; circuit breakers
              </h4>
              {(providers ?? []).length === 0 ? (
                <EmptyState title="No providers reported" />
              ) : (
                <motion.ul variants={staggerContainerLoose} initial="hidden" animate="show" className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                  {(providers ?? []).map((p) => {
                    const tone = providerTone(p);
                    const healthy = tone === "success";
                    return (
                      <motion.li key={p.name} variants={staggerItem} className="rounded-md border border-border-default p-3.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-2 text-sm font-medium text-text-primary">
                            {healthy ? <PulseDot tone="success" /> : <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-text-tertiary" aria-hidden="true" />}
                            {p.name}
                          </span>
                          <Badge tone={tone}>{providerLabel(p)}</Badge>
                        </div>
                        <dl className="mt-2.5 space-y-1 text-xs text-text-tertiary">
                          <div className="flex justify-between gap-2">
                            <dt>Consecutive failures</dt>
                            <dd className="font-tabular font-medium text-text-secondary">{p.consecutive_failures}</dd>
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
              )}
            </div>

            {usage && usage.provider_breakdown.length > 0 && (
              <div>
                <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-tertiary">By provider (24h)</h4>
                <div className="divide-y divide-border-default rounded-md border border-border-default">
                  {usage.provider_breakdown.map((row) => (
                    <div key={row.provider} className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-sm">
                      <span className="font-medium text-text-primary">{row.provider}</span>
                      <span className="flex items-center gap-3 font-tabular text-xs text-text-tertiary">
                        <span>{Math.round(row.request_count)} req</span>
                        <span>{formatPercent(row.success_rate, 0)}</span>
                        <span>{Math.round(row.avg_latency_ms)}ms</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {usage && (
              <p className="text-[11px] text-text-tertiary">
                Window: last {usage.window_hours}h, since {new Date(usage.since).toLocaleString()}.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------------------------------------------------------------------------------------------
 * Document Intelligence stats — GET /api/v1/documents, admin-agnostic (works for demo sessions).
 * ------------------------------------------------------------------------------------------- */
const STATUS_ORDER: DocumentStatus[] = ["READY", "PROCESSING", "PENDING", "FAILED"];

function statusTone(status: DocumentStatus): SemanticTone {
  switch (status) {
    case "READY":
      return "success";
    case "PROCESSING":
      return "info";
    case "PENDING":
      return "neutral";
    case "FAILED":
      return "critical";
    default:
      return "neutral";
  }
}

function DocumentIntelligenceStats() {
  const documents = useApi(() => api.documents(), []);
  const docs: Document[] = documents.data ?? [];

  const byStatus = STATUS_ORDER.map((status) => ({
    status,
    count: docs.filter((d) => d.status === status).length,
  }));
  const totalBytes = docs.reduce((sum, d) => sum + (d.file_size_bytes ?? 0), 0);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Document Intelligence</CardTitle>
          <CardDescription>Real upload counts and processing status from GET /api/v1/documents</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {documents.error ? (
          <ErrorState description={documents.error.message} onRetry={documents.reload} />
        ) : documents.loading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner />
          </div>
        ) : docs.length === 0 ? (
          <EmptyState title="No documents uploaded yet" description="Upload a document from the Documents page to see real ingestion stats here." />
        ) : (
          <motion.div variants={fadeSlideUp} initial="hidden" animate="show" className="space-y-5">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
              <MetricCard label="Total documents" value={<AnimatedNumber value={docs.length} />} />
              {byStatus.map((s) => (
                <div key={s.status} className={cn("rounded-lg border p-4", statusTone(s.status) === "critical" ? "border-critical-border bg-critical-bg" : "border-border-default bg-surface")}>
                  <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">{titleCase(s.status)}</p>
                  <p className="mt-1 font-tabular text-xl font-semibold text-text-primary">
                    <AnimatedNumber value={s.count} />
                  </p>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between rounded-md border border-border-default bg-subtle/50 px-3.5 py-3 text-sm">
              <span className="text-text-secondary">Total stored size</span>
              <span className="font-tabular font-semibold text-text-primary">{formatBytes(totalBytes)}</span>
            </div>
          </motion.div>
        )}
      </CardContent>
    </Card>
  );
}
