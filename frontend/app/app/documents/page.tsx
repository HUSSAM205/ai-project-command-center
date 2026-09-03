"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Upload, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/i18n";
import { useToast } from "@/components/ui/Toast";
import type { Document } from "@/lib/types";
import { Badge, documentStatusTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatBytes, formatDate, titleCase } from "@/lib/utils";

const ACCEPTED_EXTENSIONS = [".pdf", ".docx", ".txt"];
const IN_PROGRESS_STATUSES = new Set(["PENDING", "PROCESSING"]);
// If the backend's background job hasn't reported back in this long, treat it as stuck rather
// than silently polling forever — see the matching timeout on the document detail page.
const STALL_MS = 90_000;

function isStalled(d: Document): boolean {
  return IN_PROGRESS_STATUSES.has(d.status) && Date.now() - new Date(d.created_at).getTime() > STALL_MS;
}

interface SimulatedDocument {
  id: string;
  filename: string;
  file_type: string;
  file_size_bytes: number;
  chunk_count: number;
  created_at: string;
}

/** Runs entirely in the browser — no network call, nothing persisted anywhere. Reads the file
 * locally to produce a plausible (not fake-precise) chunk count from its real byte size, mirroring
 * the shape of the real pipeline's output without pretending to actually run it. This exists so a
 * read-only demo session can see how the upload flow behaves without hitting the real, write-gated
 * POST /documents endpoint (require_write_access — see backend/app/core/deps.py), which a demo
 * token would get a genuine 403 from. */
async function simulateLocalUpload(file: File): Promise<SimulatedDocument> {
  await new Promise((resolve) => setTimeout(resolve, 700 + Math.random() * 500));
  const approxWordsPerChunk = 220;
  const estimatedWords = Math.max(1, Math.round(file.size / 5.7));
  const chunkCount = Math.max(1, Math.ceil(estimatedWords / approxWordsPerChunk));
  return {
    id: `preview-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    filename: file.name,
    file_type: ("." + (file.name.split(".").pop()?.toLowerCase() ?? "")).replace(".", ""),
    file_size_bytes: file.size,
    chunk_count: chunkCount,
    created_at: new Date().toISOString(),
  };
}

export default function DocumentsPage() {
  const { t } = useLanguage();
  const router = useRouter();
  const { isDemo } = useAuth();
  const { push } = useToast();
  const documentsApi = useApi(() => api.documents(), []);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [simulated, setSimulated] = useState<SimulatedDocument[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const documents = useMemo(() => documentsApi.data ?? [], [documentsApi.data]);
  const hasInProgress = documents.some((d) => IN_PROGRESS_STATUSES.has(d.status));

  // Poll while any document is still PENDING/PROCESSING so the list picks up READY/FAILED
  // as the background pipeline (parse -> chunk -> embed) finishes, without a manual refresh.
  useEffect(() => {
    if (!hasInProgress) return;
    const interval = setInterval(() => documentsApi.reload(), 3000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasInProgress]);

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const file = files[0];
      const ext = "." + (file.name.split(".").pop()?.toLowerCase() ?? "");
      if (!ACCEPTED_EXTENSIONS.includes(ext)) {
        push("Only PDF, DOCX, and TXT files are supported.", "error");
        return;
      }
      setUploading(true);
      try {
        if (isDemo) {
          // Read-only session: never calls the real, write-gated upload endpoint (it would just
          // 403). Runs a genuine local simulation instead — see simulateLocalUpload() above.
          const preview = await simulateLocalUpload(file);
          setSimulated((prev) => [preview, ...prev]);
          push(`${file.name} — local preview parsed (not saved)`, "success");
        } else {
          await api.uploadDocument(file);
          push(`${file.name} uploaded — processing started`, "success");
          documentsApi.reload();
        }
      } catch (err) {
        push(err instanceof Error ? err.message : "Upload failed", "error");
      } finally {
        setUploading(false);
      }
    },
    [push, documentsApi, isDemo],
  );

  // Unified row type so a locally-parsed preview (never uploaded) and a real, saved document can
  // share one table instead of two disjointed lists/empty-states. `preview` rows carry an
  // estimated chunk count from the browser-only parse in simulateLocalUpload(); real rows never
  // fabricate one (the list endpoint doesn't return it) — a dash is honest, a made-up number isn't.
  type DocumentRow = { kind: "real"; document: Document } | { kind: "preview"; preview: SimulatedDocument };

  const documentRows: DocumentRow[] = useMemo(() => {
    const real: DocumentRow[] = documents.map((document) => ({ kind: "real", document }));
    const preview: DocumentRow[] = simulated.map((preview) => ({ kind: "preview", preview }));
    return [...preview, ...real].sort((a, b) => {
      const aTime = a.kind === "real" ? a.document.created_at : a.preview.created_at;
      const bTime = b.kind === "real" ? b.document.created_at : b.preview.created_at;
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    });
  }, [documents, simulated]);

  const columns: Column<DocumentRow>[] = [
    {
      key: "filename",
      header: "Document",
      sortValue: (r) => (r.kind === "real" ? r.document.filename : r.preview.filename),
      render: (r) => (
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 shrink-0 text-text-tertiary" aria-hidden="true" />
          <span className="font-medium text-text-primary">{r.kind === "real" ? r.document.filename : r.preview.filename}</span>
        </div>
      ),
    },
    {
      key: "type",
      header: "Type",
      sortValue: (r) => (r.kind === "real" ? r.document.file_type : r.preview.file_type),
      render: (r) => (r.kind === "real" ? r.document.file_type : r.preview.file_type).toUpperCase(),
    },
    {
      key: "size",
      header: "Size",
      align: "right",
      sortValue: (r) => (r.kind === "real" ? r.document.file_size_bytes : r.preview.file_size_bytes),
      render: (r) => formatBytes(r.kind === "real" ? r.document.file_size_bytes : r.preview.file_size_bytes),
    },
    {
      key: "chunks",
      header: "Chunks",
      align: "right",
      sortValue: (r) => (r.kind === "preview" ? r.preview.chunk_count : -1),
      render: (r) =>
        r.kind === "preview" ? (
          <span className="font-tabular text-text-secondary">~{r.preview.chunk_count} est.</span>
        ) : (
          <span className="text-text-tertiary">—</span>
        ),
    },
    {
      key: "status",
      header: "Status",
      sortValue: (r) => (r.kind === "real" ? r.document.status : "PREVIEW"),
      render: (r) =>
        r.kind === "preview" ? (
          <Badge tone="info">Local Preview</Badge>
        ) : isStalled(r.document) ? (
          <Badge tone="warning">Stalled</Badge>
        ) : (
          <Badge tone={documentStatusTone(r.document.status)}>{titleCase(r.document.status)}</Badge>
        ),
    },
    {
      key: "uploaded",
      header: "Uploaded",
      align: "right",
      sortValue: (r) => (r.kind === "real" ? r.document.created_at : r.preview.created_at),
      render: (r) => (
        <span className="font-tabular">{formatDate(r.kind === "real" ? r.document.created_at : r.preview.created_at)}</span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">{t("pageDocumentsTitle")}</h1>
        <p className="mt-1 text-sm text-text-tertiary">{documentRows.length} document{documentRows.length === 1 ? "" : "s"} — AI-extracted requirements, deliverables, and Q&amp;A</p>
      </div>

      {isDemo && (
        <div className="flex items-center gap-2 rounded-md border border-info-border bg-info-bg px-3.5 py-2.5 text-sm text-info-fg">
          <Sparkles className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Local-only preview: a file dropped below is parsed and chunk-estimated entirely in your browser — it never
            leaves this device and nothing is stored. Get full account access to run a real document through the
            extraction pipeline.
          </span>
        </div>
      )}

      <Card>
        <CardContent>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              void handleFiles(e.dataTransfer.files);
            }}
            className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors ${
              dragActive ? "border-brand-500 bg-brand-50 dark:bg-brand-950/20" : "border-border-default"
            }`}
          >
            <Upload className="mb-2 h-6 w-6 text-text-tertiary" aria-hidden="true" />
            <p className="text-sm font-medium text-text-primary">Drag and drop a document here</p>
            <p className="mt-1 text-xs text-text-tertiary">
              {isDemo ? "PDF, DOCX, or TXT — secure in-browser ingestion" : "PDF, DOCX, or TXT — up to 20MB"}
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_EXTENSIONS.join(",")}
              className="sr-only"
              onChange={(e) => void handleFiles(e.target.files)}
              aria-label="Choose a file to upload"
            />
            <Button size="sm" variant="outline" className="mt-4" loading={uploading} onClick={() => fileInputRef.current?.click()}>
              Browse files
            </Button>
          </div>
        </CardContent>
      </Card>

      {documentsApi.error ? (
        <ErrorState description={documentsApi.error.message} offline={documentsApi.error.message?.includes("offline")} onRetry={documentsApi.reload} />
      ) : documentRows.length === 0 && !documentsApi.loading ? (
        <EmptyState
          icon={<FileText className="h-6 w-6" />}
          title="No documents yet"
          description="Upload a PDF, DOCX, or TXT file to get an AI-extracted summary and ask questions about it."
        />
      ) : (
        <DataTable
          columns={columns}
          rows={documentRows}
          loading={documentsApi.loading}
          getRowKey={(r) => (r.kind === "real" ? r.document.id : r.preview.id)}
          emptyTitle="No documents yet"
          onRowClick={(r) => {
            if (r.kind === "preview") {
              push("Local previews don't have a detail page — this one was never saved.", "info");
              return;
            }
            router.push(`/app/documents/${r.document.id}`);
          }}
        />
      )}
    </div>
  );
}
