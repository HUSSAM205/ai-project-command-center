"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Briefcase, WifiOff } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import type { BusinessCase } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Textarea } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/LoadingState";
import { useAuth } from "@/lib/auth";
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
  const cases = useApi(loadBusinessCases, []);
  const rows = cases.data?.cases ?? [];
  const offline = cases.data?.offline ?? false;
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function update<K extends keyof typeof EMPTY_FORM>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit() {
    setSubmitting(true);
    setFormError(null);
    try {
      const created = await api.consulting.createBusinessCase({
        name: form.name,
        business_problem: form.business_problem,
        current_state: form.current_state,
        desired_state: form.desired_state,
        objectives: form.objectives,
        constraints: form.constraints || null,
        stakeholders: form.stakeholders || null,
        budget: form.budget ? Number(form.budget) : 0,
        timeline: form.timeline || null,
      });
      setOpen(false);
      setForm(EMPTY_FORM);
      router.push(`/app/consulting/${created.id}`);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Failed to create the business case.");
    } finally {
      setSubmitting(false);
    }
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
        {!isDemo && !offline && (
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> New Business Case
          </Button>
        )}
      </div>

      {offline && (
        <div className="flex items-center gap-2 rounded-md border border-warning-border bg-warning-bg px-3.5 py-2.5 text-sm text-warning-fg">
          <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Live backend unreachable — showing an offline preview with illustrative business cases, not your organization&apos;s real
            data.
          </span>
          <button type="button" onClick={cases.reload} className="ml-auto shrink-0 font-medium underline underline-offset-2">
            Retry
          </button>
        </div>
      )}

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
            !isDemo ? (
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
              onClick={() => !offline && router.push(`/app/consulting/${c.id}`)}
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
