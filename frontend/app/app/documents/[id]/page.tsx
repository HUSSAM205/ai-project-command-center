"use client";

import { use, useState } from "react";
import { AlertTriangle, FileText, Loader2, ShieldPlus, SendHorizonal } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useToast } from "@/components/ui/Toast";
import type { AIResponse, DocumentCitation, DocumentExtractionData } from "@/lib/types";
import { AISourceBadge, Badge, documentStatusTone } from "@/components/ui/Badge";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/LoadingState";
import { RiskFormModal } from "@/components/forms/RiskFormModal";
import { formatBytes, formatDate, titleCase } from "@/lib/utils";

interface QAEntry {
  question: string;
  answer: AIResponse;
}

export default function DocumentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const detail = useApi(() => api.document(id), [id]);
  // Only fetched to feed the project picker when a document isn't already scoped to one project
  // (Document.project_id can be null — an org-wide upload). Cheap and only used by the modal below.
  const projectsApi = useApi(() => api.projects(), []);
  const { push } = useToast();

  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [qa, setQa] = useState<QAEntry[]>([]);
  const [riskDraftTitle, setRiskDraftTitle] = useState<string | null>(null);
  const [addedRisks, setAddedRisks] = useState<Set<string>>(new Set());

  if (detail.loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (detail.error || !detail.data) {
    return (
      <ErrorState
        title="Couldn't load this document"
        description={detail.error?.message}
        offline={detail.error?.message?.includes("offline")}
        onRetry={detail.reload}
      />
    );
  }

  const { document, extraction } = detail.data;
  const extractionData = (extraction?.data ?? {}) as DocumentExtractionData;

  async function handleAsk(e: React.FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q || asking) return;
    setAsking(true);
    try {
      const answer = await api.askDocument(id, q);
      setQa((prev) => [...prev, { question: q, answer }]);
      setQuestion("");
    } catch (err) {
      push(err instanceof Error ? err.message : "Could not get an answer", "error");
    } finally {
      setAsking(false);
    }
  }

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "Documents", href: "/app/documents" }, { label: document.filename }]} />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-brand-100 text-brand-700 dark:bg-brand-800 dark:text-brand-200">
            <FileText className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-xl font-semibold text-text-primary">{document.filename}</h1>
            <p className="mt-1 text-sm text-text-tertiary">
              {document.file_type.toUpperCase()} · {formatBytes(document.file_size_bytes)} · Uploaded {formatDate(document.created_at)}
            </p>
          </div>
        </div>
        <Badge tone={documentStatusTone(document.status)}>{titleCase(document.status)}</Badge>
      </div>

      {document.status === "FAILED" && (
        <ErrorState
          title="Processing failed"
          description={document.error_message ?? "This document could not be processed."}
        />
      )}

      {(document.status === "PENDING" || document.status === "PROCESSING") && (
        <Card>
          <CardContent className="flex items-center gap-3 py-8">
            <Loader2 className="h-5 w-5 animate-spin text-text-tertiary" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium text-text-primary">
                {document.status === "PENDING" ? "Waiting to process…" : "Extracting text, chunking, and embedding…"}
              </p>
              <p className="text-xs text-text-tertiary">This page updates automatically once it&rsquo;s ready.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {document.status === "READY" && extraction && (
        <>
          <Card>
            <CardHeader>
              <div>
                <CardTitle>AI Extraction</CardTitle>
                <CardDescription>{extraction.summary}</CardDescription>
              </div>
              <AISourceBadge source={extraction.source} />
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <ExtractionSection title="Requirements" items={extractionData.requirements} />
              <ExtractionSection title="Deliverables" items={extractionData.deliverables} />
              <ExtractionSection
                title="Important Dates"
                items={extractionData.important_dates?.map((d) => `${d.date} — ${d.context}`)}
              />
              <ExtractionSection
                title="Risks"
                items={extractionData.risks}
                tone="critical"
                renderAction={(risk) =>
                  addedRisks.has(risk) ? (
                    <span className="shrink-0 text-[11px] font-medium text-success-fg">Added</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setRiskDraftTitle(risk)}
                      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border-default px-1.5 py-0.5 text-[11px] font-medium text-text-tertiary transition-colors hover:border-critical-border hover:text-critical-fg"
                    >
                      <ShieldPlus className="h-3 w-3" aria-hidden="true" /> Add to Risk Register
                    </button>
                  )
                }
              />
              <ExtractionSection title="Action Items" items={extractionData.action_items} />
              <ExtractionSection title="Missing Information" items={extractionData.missing_information} tone="warning" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Ask this document</CardTitle>
                <CardDescription>Grounded Q&amp;A over the document&rsquo;s content, with citations</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <form onSubmit={handleAsk} className="flex items-center gap-2">
                <Input
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="e.g. What is the delivery deadline?"
                  aria-label="Ask a question about this document"
                  disabled={asking}
                />
                <Button type="submit" size="md" loading={asking} disabled={!question.trim()}>
                  <SendHorizonal className="h-4 w-4" />
                  Ask
                </Button>
              </form>

              {qa.length === 0 ? (
                <p className="text-sm text-text-tertiary">Ask a question to see a grounded answer with source citations.</p>
              ) : (
                <div className="space-y-4">
                  {qa
                    .slice()
                    .reverse()
                    .map((entry, i) => (
                      <QAAnswer key={i} entry={entry} />
                    ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <RiskFormModal
        key={riskDraftTitle ?? "closed"}
        open={riskDraftTitle !== null}
        onClose={() => setRiskDraftTitle(null)}
        projectId={document.project_id ?? undefined}
        projects={projectsApi.data ?? undefined}
        prefillTitle={riskDraftTitle ?? undefined}
        onSaved={() => {
          if (riskDraftTitle) setAddedRisks((prev) => new Set(prev).add(riskDraftTitle));
          push("Risk added to the register", "success");
          setRiskDraftTitle(null);
        }}
      />
    </div>
  );
}

function ExtractionSection({
  title,
  items,
  tone = "neutral",
  renderAction,
}: {
  title: string;
  items?: string[];
  tone?: "neutral" | "critical" | "warning";
  renderAction?: (item: string) => React.ReactNode;
}) {
  const textTone =
    tone === "critical" ? "text-critical-fg" : tone === "warning" ? "text-warning-fg" : "text-text-secondary";
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-tertiary">{title}</h3>
      {!items || items.length === 0 ? (
        <p className="text-sm text-text-tertiary">None found.</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((item, i) => (
            <li key={i} className={`flex items-start justify-between gap-2 text-sm ${textTone}`}>
              <span className="flex gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-current" aria-hidden="true" />
                <span>{item}</span>
              </span>
              {renderAction?.(item)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function QAAnswer({ entry }: { entry: QAEntry }) {
  const citations = (entry.answer.data?.citations ?? []) as DocumentCitation[];
  return (
    <div className="rounded-lg border border-border-default bg-subtle/40 p-4">
      <p className="text-sm font-medium text-text-primary">{entry.question}</p>
      <div className="mt-2 flex items-start justify-between gap-3">
        <p className="text-sm text-text-secondary">{entry.answer.summary}</p>
        <AISourceBadge source={entry.answer.source} className="shrink-0" />
      </div>
      {citations.length > 0 && (
        <div className="mt-3 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">Sources</p>
          {citations.map((c, i) => (
            <div key={i} className="rounded-md border border-border-default bg-surface px-3 py-2">
              <p className="flex items-center gap-2 text-xs text-text-tertiary">
                <span className="font-tabular">
                  Chunk {c.chunk_index}
                  {c.page_number ? `, page ${c.page_number}` : ""} · similarity {c.similarity.toFixed(2)}
                </span>
              </p>
              <p className="mt-1 text-xs text-text-secondary">{c.excerpt}</p>
            </div>
          ))}
        </div>
      )}
      {citations.length === 0 && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-text-tertiary">
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> No relevant excerpt was found for this question.
        </p>
      )}
    </div>
  );
}
