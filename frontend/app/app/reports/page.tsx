"use client";

import { useState } from "react";
import { Download, FileText, Printer } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { downloadReportPdf } from "@/lib/api-pmo";
import { useApi } from "@/lib/useApi";
import type { Report, ReportType } from "@/lib/types";
import { REPORT_TYPES } from "@/lib/types";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/LoadingState";
import { AISourceBadge } from "@/components/ui/Badge";
import { cn, formatDate, titleCase } from "@/lib/utils";

export default function ReportsPage() {
  const projects = useApi(() => api.projects(), []);
  const [reportType, setReportType] = useState<ReportType>("status");
  const [projectId, setProjectId] = useState<string>("");
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const result = await api.report(reportType, projectId || undefined);
      setReport(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to generate the report.");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }

  async function downloadPdf() {
    setPdfLoading(true);
    setPdfError(null);
    try {
      await downloadReportPdf(reportType, projectId || undefined);
    } catch (err) {
      setPdfError(err instanceof ApiError ? err.message : "Failed to download the PDF.");
    } finally {
      setPdfLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Print-only overrides: force a clean light printout regardless of the app's current
          theme, and hide everything except the generated report itself. A plain <style> tag
          applies globally in the DOM, so this works without touching the shared app shell
          (frontend/app/app/layout.tsx) that renders the sidebar/topbar around this page. */}
      <style>{`
        @media print {
          aside, header, .print\\:hidden { display: none !important; }
          main { padding: 0 !important; overflow: visible !important; }
          .report-printable, .report-printable * {
            background: #fff !important;
            color: #111 !important;
            box-shadow: none !important;
            border-color: #ddd !important;
          }
          .report-printable { border: none !important; }
        }
      `}</style>

      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Reports</h1>
          <p className="mt-1 text-sm text-text-tertiary">
            Generate a structured report from live portfolio data — narrative sections are AI-generated and always
            labeled with their real source.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 print:hidden">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Report Type</CardTitle>
              <CardDescription>Choose what to generate</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {REPORT_TYPES.map((rt) => (
                <button
                  key={rt.value}
                  type="button"
                  onClick={() => setReportType(rt.value)}
                  aria-pressed={reportType === rt.value}
                  className={cn(
                    "flex flex-col items-start gap-0.5 rounded-md border px-3.5 py-3 text-left text-sm transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
                    reportType === rt.value
                      ? "border-brand-600 bg-brand-50 dark:border-brand-400 dark:bg-brand-900/30"
                      : "border-border-default hover:bg-subtle",
                  )}
                >
                  <span className="flex items-center gap-1.5 font-medium text-text-primary">
                    <FileText className="h-3.5 w-3.5 text-text-tertiary" aria-hidden="true" />
                    {rt.label}
                  </span>
                  <span className="text-xs text-text-tertiary">{rt.description}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Scope</CardTitle>
              <CardDescription>Portfolio-wide or one project</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Select
              label="Project"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              options={(projects.data ?? []).map((p) => ({ label: p.name, value: p.id }))}
              placeholder="Portfolio-wide (all projects)"
            />
            <Button onClick={generate} loading={loading} disabled={loading} className="w-full">
              Generate Report
            </Button>
            {report && (
              <>
                <Button
                  variant="outline"
                  onClick={downloadPdf}
                  loading={pdfLoading}
                  disabled={pdfLoading}
                  className="w-full"
                >
                  <Download className="h-4 w-4" /> Download PDF
                </Button>
                <Button variant="outline" onClick={() => window.print()} className="w-full">
                  <Printer className="h-4 w-4" /> Print / Save as PDF
                </Button>
                {pdfError && <p className="text-xs text-critical-fg">{pdfError}</p>}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {error && <ErrorState description={error} onRetry={generate} className="print:hidden" />}

      {loading && !report && (
        <div className="flex items-center justify-center py-16 print:hidden">
          <Spinner />
        </div>
      )}

      {!loading && !error && !report && (
        <EmptyState
          className="print:hidden"
          icon={<FileText className="h-8 w-8" />}
          title="No report generated yet"
          description="Pick a report type and scope, then click Generate Report."
        />
      )}

      {report && <ReportView report={report} />}
    </div>
  );
}

function ReportView({ report }: { report: Report }) {
  return (
    <Card className="report-printable">
      <CardContent className="space-y-6 py-6">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border-default pb-4">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">{report.title}</h2>
            <p className="mt-1 text-sm text-text-tertiary">
              {report.organization_name}
              {report.project_name ? ` — ${report.project_name}` : " — Portfolio-wide"}
            </p>
            <p className="mt-0.5 text-xs text-text-tertiary">Generated {formatDate(report.generated_at)}</p>
          </div>
          <AISourceBadge source={report.source} />
        </div>

        <div className="space-y-6">
          {report.sections.map((section, i) => (
            <section key={`${section.heading}-${i}`}>
              <h3 className="text-sm font-semibold text-text-primary">{section.heading}</h3>
              <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-text-secondary">{section.body}</p>
              {section.data && <SectionData data={section.data} />}
            </section>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/** Generic renderer for a report section's structured `data` payload — every report type
 * shapes this differently, so this renders whatever comes back rather than hard-coding one
 * schema per report type: arrays of objects become small tables, arrays of primitives
 * become a comma list, plain objects become inline stat chips, scalars become a label/value
 * row. Empty/null values are skipped. */
function SectionData({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data).filter(([, v]) => v !== null && v !== undefined && v !== "");
  if (entries.length === 0) return null;

  return (
    <div className="mt-3 space-y-3">
      {entries.map(([key, value]) => (
        <DataField key={key} label={titleCase(key)} value={value} />
      ))}
    </div>
  );
}

function DataField({ label, value }: { label: string; value: unknown }) {
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    if (typeof value[0] === "object" && value[0] !== null) {
      const rows = value as Record<string, unknown>[];
      const columns = Object.keys(rows[0]).filter((k) => k !== "project_name" || rows.some((r) => r[k]));
      return (
        <div className="overflow-x-auto">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-text-tertiary">{label}</p>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-border-default text-left text-text-tertiary">
                {columns.map((c) => (
                  <th key={c} className="py-1 pr-3 font-medium">
                    {titleCase(c)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-b border-border-default/60">
                  {columns.map((c) => (
                    <td key={c} className="py-1 pr-3 text-text-secondary">
                      {String(row[c] ?? "—")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    return (
      <p className="text-xs text-text-tertiary">
        <span className="font-medium uppercase tracking-wide">{label}:</span> {value.map(String).join(", ")}
      </p>
    );
  }

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-text-tertiary">{label}:</span>
        {Object.entries(obj).map(([k, v]) => (
          <span key={k} className="rounded-full border border-border-default bg-subtle px-2 py-0.5 text-xs text-text-secondary">
            {k} {String(v)}
          </span>
        ))}
      </div>
    );
  }

  return (
    <p className="text-xs text-text-tertiary">
      <span className="font-medium uppercase tracking-wide">{label}:</span> {String(value)}
    </p>
  );
}
