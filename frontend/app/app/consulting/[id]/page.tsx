"use client";

import { use, useMemo, useState } from "react";
import { Plus, Sparkles, RefreshCw } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useAuth } from "@/lib/auth";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Badge, AISourceBadge } from "@/components/ui/Badge";
import { Tabs } from "@/components/ui/Tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/LoadingState";
import { ImpactFeasibilityMatrix } from "@/components/viz/ImpactFeasibilityMatrix";
import { formatCompactCurrency, formatCurrency, formatDate, titleCase } from "@/lib/utils";
import type { AIOpportunity, BusinessCase, ROIRequest, ROIResult, RoadmapPhase } from "@/lib/types";

export default function BusinessCaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { isDemo } = useAuth();

  const businessCase = useApi(() => api.consulting.businessCase(id), [id]);
  const opportunities = useApi(() => api.consulting.opportunities(id), [id]);
  const roadmap = useApi(() => api.consulting.roadmap(id), [id]);

  if (businessCase.loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (businessCase.error || !businessCase.data) {
    return (
      <ErrorState
        title="Couldn't load this business case"
        description={businessCase.error?.message}
        offline={businessCase.error?.message?.includes("offline")}
        onRetry={businessCase.reload}
      />
    );
  }

  const bc = businessCase.data;

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "Consulting", href: "/app/consulting" }, { label: bc.name }]} />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">{bc.name}</h1>
          <p className="mt-1 text-sm text-text-tertiary">
            {formatCompactCurrency(bc.budget)} budget · {bc.timeline ?? "No timeline set"} · Created {formatDate(bc.created_at)}
          </p>
        </div>
      </div>

      <Tabs
        tabs={[
          { id: "overview", label: "Overview", content: <OverviewTab businessCase={bc} /> },
          {
            id: "opportunities",
            label: "Opportunities",
            badge: (opportunities.data?.length ?? 0) > 0 ? <Badge tone="neutral">{opportunities.data!.length}</Badge> : undefined,
            content: (
              <OpportunitiesTab
                businessCaseId={id}
                opportunities={opportunities.data ?? []}
                loading={opportunities.loading}
                error={opportunities.error}
                onRetry={opportunities.reload}
                onCreated={opportunities.reload}
                isDemo={isDemo}
              />
            ),
          },
          {
            id: "roi",
            label: "ROI Calculator",
            content: <ROITab businessCaseId={id} />,
          },
          {
            id: "roadmap",
            label: "Roadmap",
            content: (
              <RoadmapTab
                businessCaseId={id}
                phases={roadmap.data ?? []}
                loading={roadmap.loading}
                error={roadmap.error}
                onRetry={roadmap.reload}
                onGenerated={roadmap.reload}
                isDemo={isDemo}
              />
            ),
          },
        ]}
      />
    </div>
  );
}

function OverviewTab({ businessCase: bc }: { businessCase: BusinessCase }) {
  const fields: { label: string; value: string | null }[] = [
    { label: "Business Problem", value: bc.business_problem },
    { label: "Current State", value: bc.current_state },
    { label: "Desired State", value: bc.desired_state },
    { label: "Objectives", value: bc.objectives },
    { label: "Constraints", value: bc.constraints },
    { label: "Stakeholders", value: bc.stakeholders },
  ];

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {fields.map((f) => (
        <Card key={f.label}>
          <CardHeader>
            <CardTitle>{f.label}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed text-text-secondary">{f.value || "Not specified."}</p>
          </CardContent>
        </Card>
      ))}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Budget & Timeline</CardTitle>
          <CardDescription>Drives the deterministic roadmap phase scaffold (duration/budget split)</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-text-tertiary">Budget</dt>
              <dd className="font-tabular font-semibold text-text-primary">{formatCurrency(bc.budget)}</dd>
            </div>
            <div>
              <dt className="text-text-tertiary">Timeline</dt>
              <dd className="text-text-primary">{bc.timeline ?? "—"}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}

const EMPTY_OPP_FORM = {
  name: "",
  description: "",
  business_impact: 3,
  feasibility: 3,
  data_readiness: 3,
  cost: 3,
  time_to_value: 3,
  risk: 3,
};

const DIMENSION_FIELDS: { key: keyof typeof EMPTY_OPP_FORM; label: string; hint: string }[] = [
  { key: "business_impact", label: "Business Impact", hint: "1 = minimal, 5 = transformational" },
  { key: "feasibility", label: "Feasibility", hint: "1 = very difficult, 5 = very easy" },
  { key: "data_readiness", label: "Data Readiness", hint: "1 = data unavailable, 5 = clean & ready" },
  { key: "cost", label: "Cost", hint: "1 = very low investment, 5 = very high investment" },
  { key: "time_to_value", label: "Time to Value", hint: "1 = slow (12mo+), 5 = fast (quick win)" },
  { key: "risk", label: "Risk", hint: "1 = very low risk, 5 = very high risk" },
];

function scoreTone(score: number): "success" | "warning" | "high" | "critical" {
  if (score >= 80) return "success";
  if (score >= 60) return "warning";
  if (score >= 40) return "high";
  return "critical";
}

function OpportunitiesTab({
  businessCaseId,
  opportunities,
  loading,
  error,
  onRetry,
  onCreated,
  isDemo,
}: {
  businessCaseId: string;
  opportunities: AIOpportunity[];
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
  onCreated: () => void;
  isDemo: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_OPP_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function update<K extends keyof typeof EMPTY_OPP_FORM>(key: K, value: (typeof EMPTY_OPP_FORM)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit() {
    setSubmitting(true);
    setFormError(null);
    try {
      await api.consulting.createOpportunity(businessCaseId, {
        ...form,
        description: form.description || null,
      });
      setOpen(false);
      setForm(EMPTY_OPP_FORM);
      onCreated();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Failed to score the opportunity.");
    } finally {
      setSubmitting(false);
    }
  }

  const columns: Column<AIOpportunity>[] = [
    { key: "name", header: "Opportunity", sortValue: (o) => o.name, render: (o) => <span className="font-medium text-text-primary">{o.name}</span> },
    { key: "impact", header: "Impact", align: "right", sortValue: (o) => o.business_impact, render: (o) => <span className="font-tabular">{o.business_impact}/5</span> },
    { key: "feasibility", header: "Feasibility", align: "right", sortValue: (o) => o.feasibility, render: (o) => <span className="font-tabular">{o.feasibility}/5</span> },
    { key: "readiness", header: "Data Readiness", align: "right", sortValue: (o) => o.data_readiness, render: (o) => <span className="font-tabular">{o.data_readiness}/5</span> },
    { key: "cost", header: "Cost", align: "right", sortValue: (o) => o.cost, render: (o) => <span className="font-tabular">{o.cost}/5</span> },
    { key: "ttv", header: "Time to Value", align: "right", sortValue: (o) => o.time_to_value, render: (o) => <span className="font-tabular">{o.time_to_value}/5</span> },
    { key: "risk", header: "Risk", align: "right", sortValue: (o) => o.risk, render: (o) => <span className="font-tabular">{o.risk}/5</span> },
    {
      key: "score",
      header: "Overall Score",
      align: "right",
      sortValue: (o) => o.overall_score,
      render: (o) => <Badge tone={scoreTone(o.overall_score)}>{o.overall_score}/100</Badge>,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-text-tertiary">
          Scored with a transparent, deterministic weighted formula (business impact 30%, feasibility 20%, data readiness 15%,
          cost 15%, time to value 10%, risk 10% — cost and risk inverted). No AI in the score itself.
        </p>
        {!isDemo && (
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> Add Opportunity
          </Button>
        )}
      </div>

      {error ? (
        <ErrorState description={error.message} onRetry={onRetry} />
      ) : loading ? (
        <div className="flex h-40 items-center justify-center">
          <Spinner />
        </div>
      ) : opportunities.length === 0 ? (
        <EmptyState title="No opportunities scored yet" description="Add a candidate AI/automation use case to score it across all 6 dimensions." />
      ) : (
        <>
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Impact vs Feasibility Priority Matrix</CardTitle>
                <CardDescription>Same visual pattern as the project Risk Matrix — business impact × feasibility</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <ImpactFeasibilityMatrix opportunities={opportunities} />
            </CardContent>
          </Card>

          <DataTable columns={columns} rows={opportunities} getRowKey={(o) => o.id} emptyTitle="No opportunities scored yet" />
        </>
      )}

      <Modal
        open={open}
        onClose={() => !submitting && setOpen(false)}
        title="Score an Opportunity"
        description="Rate each dimension 1-5 — the overall score is computed by a documented, deterministic formula."
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={submit} loading={submitting} disabled={!form.name.trim() || submitting}>
              Score Opportunity
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {formError && <p className="text-sm text-critical-fg">{formError}</p>}
          <Input label="Name" required value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="e.g. Automated Claims Document Extraction" />
          <Textarea label="Description" value={form.description} onChange={(e) => update("description", e.target.value)} placeholder="What would this use case do?" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {DIMENSION_FIELDS.map((f) => (
              <div key={f.key}>
                <label className="mb-1.5 block text-sm font-medium text-text-primary">
                  {f.label}: <span className="font-tabular">{form[f.key]}</span>
                </label>
                <input
                  type="range"
                  min={1}
                  max={5}
                  step={1}
                  value={form[f.key]}
                  onChange={(e) => update(f.key, Number(e.target.value))}
                  className="w-full accent-brand-600"
                  aria-label={f.label}
                />
                <p className="mt-1 text-xs text-text-tertiary">{f.hint}</p>
              </div>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  );
}

const EMPTY_ROI_FORM: Record<keyof ROIRequest, string> = {
  current_cost: "",
  implementation_cost: "",
  expected_efficiency_gain: "",
  annual_savings: "",
  maintenance_cost: "",
};

function ROITab({ businessCaseId }: { businessCaseId: string }) {
  const [form, setForm] = useState(EMPTY_ROI_FORM);
  const [result, setResult] = useState<ROIResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(key: keyof ROIRequest, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function calculate() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.consulting.calculateRoi(businessCaseId, {
        current_cost: Number(form.current_cost || 0),
        implementation_cost: Number(form.implementation_cost || 0),
        expected_efficiency_gain: Number(form.expected_efficiency_gain || 0),
        annual_savings: Number(form.annual_savings || 0),
        maintenance_cost: Number(form.maintenance_cost || 0),
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to calculate ROI.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Inputs</CardTitle>
            <CardDescription>Pure formula — never AI-generated</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input label="Current Annual Cost" type="number" min={0} value={form.current_cost} onChange={(e) => update("current_cost", e.target.value)} hint="Annual cost of the current process" />
          <Input label="Implementation Cost" type="number" min={0} value={form.implementation_cost} onChange={(e) => update("implementation_cost", e.target.value)} hint="One-time cost to build/deploy" />
          <Input label="Expected Efficiency Gain (%)" type="number" min={0} max={100} value={form.expected_efficiency_gain} onChange={(e) => update("expected_efficiency_gain", e.target.value)} hint="% of current cost saved via efficiency" />
          <Input label="Additional Annual Savings" type="number" min={0} value={form.annual_savings} onChange={(e) => update("annual_savings", e.target.value)} hint="Direct annual savings/revenue unlocked" />
          <Input label="Annual Maintenance Cost" type="number" min={0} value={form.maintenance_cost} onChange={(e) => update("maintenance_cost", e.target.value)} hint="Ongoing annual cost to run the solution" />
          {error && <p className="text-sm text-critical-fg">{error}</p>}
          <Button onClick={calculate} loading={loading} disabled={loading} className="w-full">
            Calculate ROI
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Results</CardTitle>
        </CardHeader>
        <CardContent>
          {!result ? (
            <EmptyState title="No calculation yet" description="Fill in the inputs and click Calculate ROI." />
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Stat label="Annual Benefit" value={formatCurrency(result.annual_benefit)} />
                <Stat label="Net Benefit (Year 1)" value={formatCurrency(result.net_benefit)} tone={result.net_benefit >= 0 ? "success" : "critical"} />
                <Stat
                  label="ROI"
                  value={result.roi_percent !== null ? `${result.roi_percent.toFixed(1)}%` : "N/A"}
                  tone={result.roi_percent !== null && result.roi_percent >= 0 ? "success" : "critical"}
                />
                <Stat
                  label="Payback Period"
                  value={result.payback_period_months !== null ? `${result.payback_period_months.toFixed(1)} mo` : "Never"}
                />
              </div>
              <div className="rounded-md border border-border-default bg-subtle p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">Formula</p>
                <p className="mt-1 text-xs leading-relaxed text-text-secondary">{result.formula}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "success" | "critical" }) {
  const color = tone === "success" ? "text-success-fg" : tone === "critical" ? "text-critical-fg" : "text-text-primary";
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">{label}</p>
      <p className={`mt-1 font-tabular text-xl font-semibold ${color}`}>{value}</p>
    </div>
  );
}

const PHASE_LABELS: Record<string, string> = {
  DISCOVERY: "Discovery",
  DATA_READINESS: "Data Readiness",
  PILOT: "Pilot",
  IMPLEMENTATION: "Implementation",
  SCALE: "Scale",
};

function RoadmapTab({
  businessCaseId,
  phases,
  loading,
  error,
  onRetry,
  onGenerated,
  isDemo,
}: {
  businessCaseId: string;
  phases: RoadmapPhase[];
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
  onGenerated: () => void;
  isDemo: boolean;
}) {
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  const sorted = useMemo(() => [...phases].sort((a, b) => a.sequence_order - b.sequence_order), [phases]);
  const totalWeeks = sorted.reduce((sum, p) => sum + p.duration_weeks, 0);
  const totalBudget = sorted.reduce((sum, p) => sum + p.budget, 0);

  async function generate() {
    setGenerating(true);
    setGenError(null);
    try {
      await api.consulting.generateRoadmap(businessCaseId);
      onGenerated();
    } catch (err) {
      setGenError(err instanceof ApiError ? err.message : "Failed to generate the roadmap.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-text-tertiary">
          5 fixed phases (Discovery → Data Readiness → Pilot → Implementation → Scale). Duration/budget/resources are a
          transparent deterministic scaffold; objectives, deliverables, risks, and KPIs are AI-narrated from this business
          case&apos;s real intake and scored opportunities.
        </p>
        {!isDemo && (
          <Button size="sm" onClick={generate} loading={generating} disabled={generating}>
            {sorted.length > 0 ? <RefreshCw className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
            {sorted.length > 0 ? "Regenerate Roadmap" : "Generate Roadmap"}
          </Button>
        )}
      </div>

      {genError && <p className="text-sm text-critical-fg">{genError}</p>}

      {error ? (
        <ErrorState description={error.message} onRetry={onRetry} />
      ) : loading || generating ? (
        <div className="flex h-40 items-center justify-center">
          <Spinner />
        </div>
      ) : sorted.length === 0 ? (
        <EmptyState
          icon={<Sparkles className="h-8 w-8" />}
          title="No roadmap generated yet"
          description="Generate a 5-phase transformation roadmap grounded in this business case's real intake and scored opportunities."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Total Duration" value={`${totalWeeks} weeks`} />
            <Stat label="Total Budget" value={formatCompactCurrency(totalBudget)} />
            <Stat label="Phases" value={String(sorted.length)} />
          </div>

          <ol className="relative ml-2 space-y-6 border-l border-border-default pl-6">
            {sorted.map((phase) => (
              <li key={phase.id} className="relative">
                <span className="absolute -left-[29px] top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 border-brand-500 bg-surface font-tabular text-[9px] font-semibold text-brand-600">
                  {phase.sequence_order}
                </span>
                <Card>
                  <CardHeader>
                    <div>
                      <CardTitle>{PHASE_LABELS[phase.phase] ?? titleCase(phase.phase)}</CardTitle>
                      <CardDescription>
                        {phase.duration_weeks} weeks · {formatCompactCurrency(phase.budget)} · {phase.resources.join(", ")}
                      </CardDescription>
                    </div>
                    <AISourceBadge source={phase.source} />
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <PhaseList label="Objectives" items={phase.objectives} />
                    <PhaseList label="Deliverables" items={phase.deliverables} />
                    <PhaseList label="KPIs" items={phase.kpis} />
                    <PhaseList label="Risks" items={phase.risks} />
                  </CardContent>
                </Card>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}

function PhaseList({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-text-tertiary">{label}</p>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="text-sm leading-relaxed text-text-secondary">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
