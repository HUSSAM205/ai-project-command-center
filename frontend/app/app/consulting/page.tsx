"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Briefcase } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import type { BusinessCase } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Textarea } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { OfflinePreviewBanner } from "@/components/ui/OfflinePreviewBanner";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/LoadingState";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/lib/auth";
import { isPreviewId, makePreviewId, simulateLatency } from "@/lib/demoSandbox";
import { cn, formatCompactCurrency, formatDate } from "@/lib/utils";
import { buildOfflineConsultingCases, withTimeout } from "@/lib/offlinePreview";

interface ConsultingCasesResult {
  cases: BusinessCase[];
  offline: boolean;
}

/** Same fallback discipline as the PMO workspace (see lib/offlinePreview.ts): GET auto-retry in
 * lib/api.ts already covers a Render cold-start, so this only engages once that's exhausted or
 * the request hangs past OVERALL_TIMEOUT_MS. Falls back to a static, honestly-labeled fictional
 * case list rather than a bare error box. */
async function loadBusinessCases(): Promise<ConsultingCasesResult> {
  try {
    const cases = await withTimeout(api.consulting.businessCases());
    return { cases, offline: false };
  } catch {
    return { cases: buildOfflineConsultingCases(), offline: true };
  }
}

const EMPTY_FORM = {
  name: "",
  business_problem: "",
  current_state: "",
  desired_state: "",
  objectives: "",
  constraints: "",
  stakeholders: "",
  budget: "",
  timeline: "",
};

export default function ConsultingPage() {
  const router = useRouter();
  const { isDemo } = useAuth();
  const { push } = useToast();
  const cases = useApi(loadBusinessCases, []);
  const [localCases, setLocalCases] = useState<BusinessCase[] | null>(null);
  const rows = localCases ?? cases.data?.cases ?? [];
  const offline = cases.data?.offline ?? false;
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function update<K extends keyof typeof EMPTY_FORM>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  // In a demo (anonymous, read-only) session this never calls the real, write-gated
  // POST /business-cases endpoint (it would just 403). It resolves locally instead, same
  // sandbox pattern as Task/Risk/Project creation elsewhere in the app (lib/demoSandbox.ts) --
  // the ROI calculator and roadmap generator on the detail page are real backend calls scoped
  // to a real case id, so a sandboxed case stays on this list rather than navigating to a detail
  // page that can't exist server-side (same reasoning as the Projects page's preview-id guard).
  async function submit() {
    setSubmitting(true);
    setFormError(null);
    try {
      const payload = {
        name: form.name,
        business_problem: form.business_problem,
        current_state: form.current_state,
        desired_state: form.desired_state,
        objectives: form.objectives,
        constraints: form.constraints || null,
        stakeholders: form.stakeholders || null,
        budget: form.budget ? Number(form.budget) : 0,
        timeline: form.timeline || null,
      };
      if (isDemo) {
        await simulateLatency();
        const now = new Date().toISOString();
        const created: BusinessCase = {
          id: makePreviewId(),
          organization_id: "",
          name: payload.name,
          business_problem: payload.business_problem,
          current_state: payload.current_state,
          desired_state: payload.desired_state,
          objectives: payload.objectives,
          constraints: payload.constraints,
          stakeholders: payload.stakeholders,
          budget: payload.budget,
          timeline: payload.timeline,
          created_by: null,
          created_at: now,
        };
        setLocalCases([created, ...rows]);
        setOpen(false);
        setForm(EMPTY_FORM);
        push("Business case created — sandbox only, not saved", "success");
      } else {
        const created = await api.consulting.createBusinessCase(payload);
        setOpen(false);
        setForm(EMPTY_FORM);
        router.push(`/app/consulting/${created.id}`);
      }
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Failed to create the business case.");
    } finally {
      setSubmitting(false);
    }
  }

  function openCase(c: BusinessCase) {
    if (offline) return;
    if (isPreviewId(c.id)) {
      push("Sandbox-only business cases don't have a detail page — this one was never saved.", "info");
      return;
    }
    router.push(`/app/consulting/${c.id}`);
  }

  const canSubmit =
    form.name.trim() && form.business_problem.trim() && form.current_state.trim() && form.desired_state.trim() && form.objectives.trim();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">AI Consulting Workspace</h1>
          <p className="mt-1 text-sm text-text-tertiary">
            Digital transformation business cases — scored opportunities, an ROI calculator, and an AI-narrated roadmap.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {offline && <OfflinePreviewBanner onRetry={cases.reload} subject="business cases" inline />}
          {!offline && (
            <Button size="sm" onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" /> New Business Case
            </Button>
          )}
        </div>
      </div>

      {cases.loading ? (
        <div className="flex h-40 items-center justify-center">
          <Spinner />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Briefcase className="h-8 w-8" />}
          title="No business cases yet"
          description="Start a new business case to intake a transformation opportunity, score use cases, and generate a roadmap."
          action={
            !offline ? (
              <Button size="sm" onClick={() => setOpen(true)}>
                <Plus className="h-4 w-4" /> New Business Case
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((c: BusinessCase) => (
            <Card
              key={c.id}
              className={cn("p-5 transition-colors", offline ? "cursor-default opacity-90" : "cursor-pointer hover:bg-subtle")}
              onClick={() => openCase(c)}
            >
              <p className="font-medium text-text-primary">{c.name}</p>
              <p className="mt-1.5 line-clamp-2 text-xs text-text-tertiary">{c.business_problem}</p>
              <div className="mt-4 flex items-center justify-between text-xs text-text-tertiary">
                <span className="font-tabular">{formatCompactCurrency(c.budget)}</span>
                <span>{c.timeline ?? "No timeline set"}</span>
              </div>
              <p className="mt-1 text-[11px] text-text-tertiary">Created {formatDate(c.created_at)}</p>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => !submitting && setOpen(false)}
        title="New Business Case"
        description="Capture the transformation intake — this grounds every scored opportunity and AI-narrated roadmap phase."
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={submit} loading={submitting} disabled={!canSubmit || submitting}>
              Create Business Case
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {formError && <p className="text-sm text-critical-fg">{formError}</p>}
          <Input label="Name" required value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="e.g. Claims Intake Automation" />
          <Textarea
            label="Business Problem"
            required
            value={form.business_problem}
            onChange={(e) => update("business_problem", e.target.value)}
            placeholder="What problem are you solving, quantified where possible?"
          />
          <Textarea
            label="Current State"
            required
            value={form.current_state}
            onChange={(e) => update("current_state", e.target.value)}
            placeholder="How does the process work today?"
          />
          <Textarea
            label="Desired State"
            required
            value={form.desired_state}
            onChange={(e) => update("desired_state", e.target.value)}
            placeholder="What does success look like?"
          />
          <Textarea
            label="Objectives"
            required
            value={form.objectives}
            onChange={(e) => update("objectives", e.target.value)}
            placeholder="Measurable objectives this initiative must hit"
          />
          <Textarea
            label="Constraints"
            value={form.constraints}
            onChange={(e) => update("constraints", e.target.value)}
            placeholder="Budget, regulatory, technical, or timing constraints"
          />
          <Textarea
            label="Stakeholders"
            value={form.stakeholders}
            onChange={(e) => update("stakeholders", e.target.value)}
            placeholder="Sponsors, affected teams, decision-makers"
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Budget"
              type="number"
              min={0}
              value={form.budget}
              onChange={(e) => update("budget", e.target.value)}
              placeholder="0"
            />
            <Input label="Timeline" value={form.timeline} onChange={(e) => update("timeline", e.target.value)} placeholder="e.g. 9 months" />
          </div>
        </div>
      </Modal>
    </div>
  );
}
