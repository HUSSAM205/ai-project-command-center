"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
// Mirrors backend/app/api/documents.py's DEMO_UPLOAD_MAX_BYTES exactly — checked client-side too
// so a guest gets an instant, honest rejection instead of waiting on a round-trip 413.
const DEMO_UPLOAD_MAX_BYTES = 2 * 1024 * 1024;

function isStalled(d: Document): boolean {
  return IN_PROGRESS_STATUSES.has(d.status) && Date.now() - new Date(d.created_at).getTime() > STALL_MS;
}

export default function DocumentsPage() {
  const { t } = useLanguage();
  const router = useRouter();
  const { isDemo } = useAuth();
  const { push } = useToast();
  const documentsApi = useApi(() => api.documents(), []);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const documents = documentsApi.data ?? [];
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
      // Backend/app/api/documents.py enforces this too (413) -- checked here first so a guest
      // over the cap gets an instant answer instead of a round trip that ends the same way.
      if (isDemo && file.size > DEMO_UPLOAD_MAX_BYTES) {
        push(`Guest uploads are limited to ${DEMO_UPLOAD_MAX_BYTES / (1024 * 1024)}MB. Get full account access for larger files.`, "error");
        return;
      }
      setUploading(true);
      try {
        // Runs through the same real, write-gated pipeline for every session now -- a demo/guest
        // token is allowed through this one endpoint under a strict, session-scoped hourly budget
        // and a lower size cap (backend/app/api/documents.py's DEMO_UPLOAD_* constants), with the
        // resulting document auto-removed after about an hour and visible only to that session.
        // A guest over the hourly budget gets a real 429 here, surfaced via the catch below.
        await api.uploadDocument(file);
        push(`${file.name} uploaded — processing started`, "success");
        documentsApi.reload();
      } catch (err) {
        push(err instanceof Error ? err.message : "Upload failed", "error");
      } finally {
        setUploading(false);
      }
    },
    [push, documentsApi, isDemo],
  );

  const columns: Column<Document>[] = [
    {
      key: "filename",
      header: "Document",
      sortValue: (d) => d.filename,
      render: (d) => (
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 shrink-0 text-text-tertiary" aria-hidden="true" />
          <span className="font-medium text-text-primary">{d.filename}</span>
        </div>
      ),
    },
    { key: "type", header: "Type", sortValue: (d) => d.file_type, render: (d) => d.file_type.toUpperCase() },
    { key: "size", header: "Size", align: "right", sortValue: (d) => d.file_size_bytes, render: (d) => formatBytes(d.file_size_bytes) },
    {
      key: "status",
      header: "Status",
      sortValue: (d) => d.status,
      render: (d) =>
        isStalled(d) ? (
          <Badge tone="warning">Stalled</Badge>
        ) : (
          <Badge tone={documentStatusTone(d.status)}>{titleCase(d.status)}</Badge>
        ),
    },
    { key: "uploaded", header: "Uploaded", align: "right", sortValue: (d) => d.created_at, render: (d) => <span className="font-tabular">{formatDate(d.created_at)}</span> },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">{t("pageDocumentsTitle")}</h1>
        <p className="mt-1 text-sm text-text-tertiary">{documents.length} document{documents.length === 1 ? "" : "s"} — AI-extracted requirements, deliverables, and Q&amp;A</p>
      </div>

      {isDemo && (
        <div className="flex items-center gap-2 rounded-md border border-info-border bg-info-bg px-3.5 py-2.5 text-sm text-info-fg">
          <Sparkles className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Guest uploads run through the real AI extraction pipeline — up to 3 files/hour, 2MB each, visible only to
            you, and removed automatically after about an hour. Get full account access for unlimited uploads.
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
              {isDemo ? "PDF, DOCX, or TXT — up to 2MB, 3 per hour as a guest" : "PDF, DOCX, or TXT — up to 20MB"}
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
      ) : documents.length === 0 && !documentsApi.loading ? (
        <EmptyState
          icon={<FileText className="h-6 w-6" />}
          title="No documents yet"
          description="Upload a PDF, DOCX, or TXT file to get an AI-extracted summary and ask questions about it."
        />
      ) : (
        <DataTable
          columns={columns}
          rows={documents}
          loading={documentsApi.loading}
          getRowKey={(d) => d.id}
          emptyTitle="No documents yet"
          onRowClick={(d) => router.push(`/app/documents/${d.id}`)}
        />
      )}
    </div>
  );
}
