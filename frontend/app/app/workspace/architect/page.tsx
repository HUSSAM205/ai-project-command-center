"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Cpu, Database, FileSearch, Info, Network, ShieldAlert, Sparkles } from "lucide-react";
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
import { Drawer } from "@/components/ui/Drawer";
import { staggerContainerLoose, staggerItem, fadeSlideUp } from "@/lib/motion";
import { formatPercent, formatBytes, titleCase, cn } from "@/lib/utils";
import type { AIProviderStatus, AIUsage, Document, DocumentStatus } from "@/lib/types";

/**
 * "AI Solution Architect" workspace — a curated, read-only aggregation of real data already
 * served elsewhere in the app (see docs/AI_ARCHITECTURE.md, TelemetryDrawer, GET /api/v1/documents).
 * Nothing here is a new data source: the pipeline diagram is a static explainer of the real
 * document-intelligence flow (now clickable — each stage opens a drawer with the real data behind
 * it), and the telemetry/document stats below it are the same live numbers TelemetryDrawer and the
 * Documents page already show, just curated for an architect's view. The document fetch and the AI
 * provider/usage fetch are each made exactly once per page load and shared between the diagram's
 * drawer and the cards below it — see useApi(...)/useAIRouterTelemetry() in this file.
 */
export default function ArchitectWorkspacePage() {
  const documents = useApi(() => api.documents(), []);
  const telemetry = useAIRouterTelemetry();
  const [activeStage, setActiveStage] = useState<StageId | null>(null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">AI Solution Architect</h1>
        <p className="mt-1 text-sm text-text-tertiary">
          How this app&apos;s document intelligence and AI router actually work, plus the real telemetry behind them.
        </p>
      </div>

      <PipelineDiagram activeStage={activeStage} onSelectStage={setActiveStage} />
      <StageInspectorDrawer
        stageId={activeStage}
        onClose={() => setActiveStage(null)}
        documents={documents}
        telemetry={telemetry}
      />
      <AIRouterTelemetry telemetry={telemetry} />
      <DocumentIntelligenceStats documents={documents} />
      <TradeOffCalculator />
    </div>
  );
}

/* ---------------------------------------------------------------------------------------------
 * Pipeline diagram — static, illustrative, not live data. Every label below is grounded in the
 * real implementation: backend/app/services/document_chunking.py (500-char chunks, 75 overlap),
 * backend/app/services/embeddings.py (sentence-transformers all-MiniLM-L6-v2, 384-dim, local/CPU,
 * no API key), backend/app/api/documents.py (cosine-similarity top-k retrieval for /ask), and
 * backend/app/ai/router.py (the 4-tier Gemini -> Groq -> cache -> Demo AI fallback chain — see
 * docs/AI_ARCHITECTURE.md). The box-and-arrow layout itself stays plain HTML/CSS, not a live-data
 * flow visualization — but each box is now a real button that opens a drawer with genuine data for
 * that stage (see StageInspectorDrawer below).
 * ------------------------------------------------------------------------------------------- */
type StageId = "ingestion" | "chunking" | "retrieval" | "router" | "response";

interface Stage {
  id: StageId;
  title: string;
  icon: React.ReactNode;
  detail: string;
  source: string;
}

const STAGES: Stage[] = [
  {
    id: "ingestion",
    title: "Data Ingestion",
    icon: <FileSearch className="h-5 w-5" />,
    detail: "PDF/DOCX/TXT upload, parsed to plain text server-side",
    source: "app/api/documents.py",
  },
  {
    id: "chunking",
    title: "Chunking / Embedding",
    icon: <Database className="h-5 w-5" />,
    detail: "500-char sliding-window chunks (75-char overlap) -> 384-dim vectors (all-MiniLM-L6-v2, local CPU)",
    source: "document_chunking.py, embeddings.py",
  },
  {
    id: "retrieval",
    title: "Vector Retrieval",
    icon: <Network className="h-5 w-5" />,
    detail: "Cosine similarity over a document's stored chunk vectors, top-k passed as context",
    source: "app/api/documents.py::ask",
  },
  {
    id: "router",
    title: "LLM Router",
    icon: <Cpu className="h-5 w-5" />,
    detail: "Gemini -> Groq -> Redis cache -> Demo AI, first success wins, circuit breaker per provider",
    source: "app/ai/router.py",
  },
  {
    id: "response",
    title: "Response",
    icon: <Sparkles className="h-5 w-5" />,
    detail: "AIResponse { summary, detail, confidence, source, data } — source always honest",
    source: "app/schemas/ai.py",
  },
];

function PipelineDiagram({
  activeStage,
  onSelectStage,
}: {
  activeStage: StageId | null;
  onSelectStage: (id: StageId) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Document Intelligence Pipeline</CardTitle>
          <CardDescription>
            A static, illustrative explainer of the real architecture — not a live-data flow. Click a stage to inspect the
            real data behind it. See docs/AI_ARCHITECTURE.md.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch">
          {STAGES.map((stage, i) => (
            <div key={stage.id} className="flex flex-1 items-center gap-3">
              <button
                type="button"
                onClick={() => onSelectStage(stage.id)}
                aria-haspopup="dialog"
                aria-expanded={activeStage === stage.id}
                className={cn(
                  "flex flex-1 flex-col rounded-lg border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
                  activeStage === stage.id
                    ? "border-brand-500 bg-brand-50/60 dark:border-brand-400 dark:bg-brand-900/30"
                    : "border-border-default bg-subtle/40 hover:border-brand-300 hover:bg-brand-50/30 dark:hover:bg-brand-900/15",
                )}
              >
                <div className="flex items-center gap-2 text-brand-700 dark:text-brand-300">
                  {stage.icon}
                  <span className="text-sm font-semibold text-text-primary">{stage.title}</span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-text-secondary">{stage.detail}</p>
                <p className="mt-2 font-tabular text-[10px] uppercase tracking-wide text-text-tertiary">{stage.source}</p>
                <span className="mt-2.5 text-[11px] font-medium text-brand-700 dark:text-brand-300">Inspect real data →</span>
              </button>
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
 * Stage inspector drawer — opened by clicking a pipeline stage above. Ingestion/Chunking reuse the
 * single `documents` fetch made at the page level; the LLM Router reuses the single AI-provider/
 * usage fetch made at the page level (see useAIRouterTelemetry below) — neither stage duplicates a
 * network call the page already makes. Retrieval/Response have no additional real metric beyond
 * what's already in the diagram, so they render the same static explainer text honestly labeled as
 * such, per the same standard the rest of this page holds itself to.
 * ------------------------------------------------------------------------------------------- */
function StageInspectorDrawer({
  stageId,
  onClose,
  documents,
  telemetry,
}: {
  stageId: StageId | null;
  onClose: () => void;
  documents: ReturnType<typeof useApi<Document[]>>;
  telemetry: ReturnType<typeof useAIRouterTelemetry>;
}) {
  const stage = STAGES.find((s) => s.id === stageId) ?? null;

  return (
    <Drawer open={stageId !== null} onClose={onClose} title={stage?.title ?? "Pipeline stage"} width="md">
      {stageId === "ingestion" && <DocumentStageContent documents={documents} framing="ingestion" />}
      {stageId === "chunking" && <DocumentStageContent documents={documents} framing="chunking" />}
      {stageId === "router" && <RouterStageContent telemetry={telemetry} />}
      {(stageId === "retrieval" || stageId === "response") && stage && <StaticExplainer stage={stage} />}
    </Drawer>
  );
}

function DocumentStageContent({
  documents,
  framing,
}: {
  documents: ReturnType<typeof useApi<Document[]>>;
  framing: "ingestion" | "chunking";
}) {
  const docs: Document[] = documents.data ?? [];
  const byStatus = STATUS_ORDER.map((status) => ({ status, count: docs.filter((d) => d.status === status).length }));
  const totalBytes = docs.reduce((sum, d) => sum + (d.file_size_bytes ?? 0), 0);

  return (
    <div className="space-y-5">
      <p className="text-xs leading-relaxed text-text-secondary">
        {framing === "ingestion"
          ? "Real upload counts and processing status for every document in this organization — the same source the Document Intelligence card on this page uses, straight from GET /api/v1/documents."
          : "A document in READY status has completed chunking (500-char sliding-window chunks, 75-char overlap) and embedding (384-dim vectors, all-MiniLM-L6-v2, local CPU, no API key). See document_chunking.py / embeddings.py."}
      </p>
      {documents.error ? (
        <ErrorState description={documents.error.message} onRetry={documents.reload} />
      ) : documents.loading ? (
        <div className="flex items-center justify-center py-10">
          <Spinner />
        </div>
      ) : docs.length === 0 ? (
        <EmptyState
          title="No documents uploaded yet"
          description="Upload a document from the Documents page to see real ingestion stats here."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            {byStatus.map((s) => (
              <div
                key={s.status}
                className={cn(
                  "rounded-md border p-3",
                  s.status === "FAILED" ? "border-critical-border bg-critical-bg" : "border-border-default bg-subtle/40",
                )}
              >
                <p className="text-[11px] font-medium uppercase tracking-wide text-text-tertiary">{titleCase(s.status)}</p>
                <p className="mt-1 font-tabular text-lg font-semibold text-text-primary">
                  <AnimatedNumber value={s.count} />
                </p>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between rounded-md border border-border-default bg-subtle/50 px-3.5 py-2.5 text-sm">
            <span className="text-text-secondary">Total documents / stored size</span>
            <span className="font-tabular font-semibold text-text-primary">
              {docs.length} · {formatBytes(totalBytes)}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function RouterStageContent({ telemetry }: { telemetry: ReturnType<typeof useAIRouterTelemetry> }) {
  const { providers, usage, loading, forbidden, error, reload } = telemetry;

  return (
    <div className="space-y-5">
      <p className="text-xs leading-relaxed text-text-secondary">
        Real circuit-breaker state and request volume for the Gemini → Groq → Redis cache → Demo AI fallback chain — the same
        source as the AI Router Telemetry card on this page and the topbar&apos;s live telemetry drawer, not a duplicated
        fetch.
      </p>
      {forbidden ? (
        <EmptyState
          icon={<ShieldAlert className="h-8 w-8" />}
          title="Admin access required"
          description="AI router telemetry is only visible to admin accounts. This session doesn't have the admin.access permission."
        />
      ) : error ? (
        <ErrorState description={error} onRetry={reload} />
      ) : loading && !providers ? (
        <div className="flex items-center justify-center py-10">
          <Spinner />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2.5">
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
          <ul className="space-y-2">
            {(providers ?? []).map((p) => {
              const tone = providerTone(p);
              return (
                <li
                  key={p.name}
                  className="flex items-center justify-between rounded-md border border-border-default px-3 py-2 text-sm"
                >
                  <span className="flex items-center gap-2 font-medium text-text-primary">
                    {tone === "success" ? (
                      <PulseDot tone="success" />
                    ) : (
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-text-tertiary" aria-hidden="true" />
                    )}
                    {p.name}
                  </span>
                  <Badge tone={tone}>{providerLabel(p)}</Badge>
                </li>
              );
            })}
            {(providers ?? []).length === 0 && <EmptyState title="No providers reported" />}
          </ul>
        </>
      )}
    </div>
  );
}

function StaticExplainer({ stage }: { stage: Stage }) {
  return (
    <div className="space-y-4">
      <p className="text-xs leading-relaxed text-text-secondary">{stage.detail}</p>
      <p className="font-tabular text-[11px] uppercase tracking-wide text-text-tertiary">{stage.source}</p>
      <div className="rounded-md border border-border-default bg-subtle/40 p-3.5 text-xs leading-relaxed text-text-tertiary">
        This is a static explainer of the real architecture, not a live-data view — there is no additional per-request metric
        to show for this stage beyond what&apos;s already illustrated in the pipeline diagram. See docs/AI_ARCHITECTURE.md.
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------------------------
 * AI Router Telemetry — same real data source as components/ui/TelemetryDrawer.tsx
 * (GET /api/v1/admin/ai-providers, GET /api/v1/admin/ai-usage). Admin-gated; a non-admin/demo
 * session gets a real 403, rendered honestly here rather than crashing, same pattern the drawer
 * already uses. The fetch itself lives in useAIRouterTelemetry() at module scope below so the LLM
 * Router drawer above can render the identical state without issuing a second request.
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

function useAIRouterTelemetry() {
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

  return { providers, usage, loading, forbidden, error, reload: load };
}

function AIRouterTelemetry({ telemetry }: { telemetry: ReturnType<typeof useAIRouterTelemetry> }) {
  const { providers, usage, loading, forbidden, error, reload } = telemetry;

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
          <ErrorState description={error} onRetry={reload} />
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
 * Fetched once at the page level and passed in, so the Data Ingestion / Chunking drawers above
 * share this exact same request instead of issuing their own.
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

function DocumentIntelligenceStats({ documents }: { documents: ReturnType<typeof useApi<Document[]>> }) {
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

/* ---------------------------------------------------------------------------------------------
 * Honest Trade-Off Calculator — illustrative only. Both sliders are real, code-backed RAG
 * parameters in this deployment (retrieval breadth = TOP_K_CHUNKS in app/api/documents.py; chunk
 * overlap = CHUNK_OVERLAP in app/services/document_chunking.py) — genuine tunables of the pipeline
 * above, even though neither is exposed as a user setting today. The formula below is a small,
 * explicit, disclosed estimate — not a live measurement. No request is made and no real latency is
 * sampled when the sliders move; see AI Router Telemetry above for what this deployment actually
 * measures.
 * ------------------------------------------------------------------------------------------- */
const RAG_DEFAULTS = {
  chunkSizeChars: 500,
  chunkOverlapChars: 75,
  topK: 5,
};

function estimateRelevancePct(topK: number, overlap: number): number {
  const value = 45 + 11 * Math.log2(topK + 1) + 0.28 * overlap;
  return Math.min(97, Math.max(5, value));
}

function estimateLatencyMs(topK: number, overlap: number): number {
  return 350 + topK * 52 + overlap * 0.6;
}

function TradeOffCalculator() {
  const [topK, setTopK] = useState(RAG_DEFAULTS.topK);
  const [overlap, setOverlap] = useState(RAG_DEFAULTS.chunkOverlapChars);
  const [showFormula, setShowFormula] = useState(false);

  const relevance = estimateRelevancePct(topK, overlap);
  const latency = estimateLatencyMs(topK, overlap);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Honest Trade-Off Calculator</CardTitle>
          <CardDescription>
            Illustrative estimate based on typical RAG cost/latency tradeoffs — not a live measurement of this deployment.
          </CardDescription>
        </div>
        <button
          type="button"
          onClick={() => setShowFormula((v) => !v)}
          aria-expanded={showFormula}
          className="flex shrink-0 items-center gap-1.5 rounded-md border border-border-default px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-subtle"
        >
          <Info className="h-3.5 w-3.5" aria-hidden="true" />
          {showFormula ? "Hide formula" : "Show formula"}
        </button>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="text-xs leading-relaxed text-text-tertiary">
          Both sliders are real, code-backed RAG parameters in this deployment — not currently exposed as user settings, but
          genuine tunables of the pipeline above. Defaults match what this deployment actually runs today: top-k ={" "}
          {RAG_DEFAULTS.topK}, overlap = {RAG_DEFAULTS.chunkOverlapChars} chars of a fixed {RAG_DEFAULTS.chunkSizeChars}-char
          chunk.
        </p>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <div className="flex items-center justify-between text-sm">
              <label htmlFor="topk-slider" className="font-medium text-text-primary">
                Retrieval breadth (top-k chunks)
              </label>
              <span className="font-tabular font-semibold text-text-primary">{topK}</span>
            </div>
            <input
              id="topk-slider"
              type="range"
              min={1}
              max={15}
              step={1}
              value={topK}
              onChange={(e) => setTopK(Number(e.target.value))}
              className="mt-2 w-full accent-brand-700"
            />
            <p className="mt-1 text-[11px] text-text-tertiary">
              How many top-similarity chunks are retrieved per question. Deployment default: {RAG_DEFAULTS.topK}.
            </p>
          </div>
          <div>
            <div className="flex items-center justify-between text-sm">
              <label htmlFor="overlap-slider" className="font-medium text-text-primary">
                Chunk overlap (characters)
              </label>
              <span className="font-tabular font-semibold text-text-primary">{overlap}</span>
            </div>
            <input
              id="overlap-slider"
              type="range"
              min={0}
              max={200}
              step={5}
              value={overlap}
              onChange={(e) => setOverlap(Number(e.target.value))}
              className="mt-2 w-full accent-brand-700"
            />
            <p className="mt-1 text-[11px] text-text-tertiary">
              Overlap between consecutive {RAG_DEFAULTS.chunkSizeChars}-char chunks. Deployment default:{" "}
              {RAG_DEFAULTS.chunkOverlapChars}.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <MetricCard
            label="Estimated relevance"
            value={<AnimatedNumber value={relevance} format={(n) => `${n.toFixed(0)}%`} />}
          />
          <MetricCard
            label="Estimated latency"
            value={<AnimatedNumber value={latency} format={(n) => `${Math.round(n)}ms`} />}
          />
        </div>

        {showFormula && (
          <div className="space-y-2 rounded-md border border-border-default bg-subtle p-3.5">
            <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">Formula &amp; assumptions</p>
            <p className="font-tabular text-xs leading-relaxed text-text-secondary">
              relevance % = clamp(45 + 11 × log2(top_k + 1) + 0.28 × overlap, 5, 97)
              <br />
              latency ms = 350 + 52 × top_k + 0.6 × overlap
            </p>
            <p className="text-xs leading-relaxed text-text-tertiary">
              Assumptions: a 350ms fixed floor for network + LLM generation time; each additional retrieved chunk adds ~52ms
              of prompt-processing time; wider retrieval and more overlap both raise the chance the truly relevant sentence
              is present, with diminishing returns on retrieval breadth (log2 of top-k); relevance is capped at 97% (never
              claims certainty) and latency has no artificial cap. These coefficients are illustrative, not fitted to
              production telemetry — see the real request-volume/latency numbers in AI Router Telemetry above for what this
              deployment actually measures.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
