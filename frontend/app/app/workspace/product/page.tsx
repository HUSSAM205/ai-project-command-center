"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ClipboardList, ShieldAlert, Sparkles } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { pmoApi } from "@/lib/api-pmo";
import { useApi } from "@/lib/useApi";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { AISourceBadge, Badge, riskLevelTone, taskStatusTone } from "@/components/ui/Badge";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/LoadingState";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Drawer } from "@/components/ui/Drawer";
import { ValueComplexityMatrix, deriveComplexity } from "@/components/viz/ValueComplexityMatrix";
import { cn, formatCompactCurrency, formatCurrency, formatDate, titleCase } from "@/lib/utils";
import type { AIOpportunity, BoardroomMemo, EVM, Project, Risk } from "@/lib/types";

type OpportunityRow = AIOpportunity & { business_case_name: string };

/** Aggregates opportunities across every business case — the same cross-entity aggregation
 * shape as lib/api.ts's allTasks()/allRisks() helpers, just applied to consulting opportunities
 * instead of a per-project resource. No new backend endpoint. */
async function loadAllOpportunities(): Promise<OpportunityRow[]> {
  const cases = await api.consulting.businessCases();
  const perCase = await Promise.all(
    cases.map((c) =>
      api.consulting.opportunities(c.id).then((opps) => opps.map((o) => ({ ...o, business_case_name: c.name }))),
    ),
  );
  return perCase.flat();
}

type Selection = { kind: "project"; project: Project } | { kind: "opportunity"; opportunity: OpportunityRow } | null;

export default function ProductWorkspacePage() {
  const { isDemo } = useAuth();
  const projects = useApi(() => api.projects(), []);
  const opportunities = useApi(loadAllOpportunities, []);
  const [selection, setSelection] = useState<Selection>(null);

  const projectColumns: Column<Project>[] = [
    {
      key: "name",
      header: "Project",
      sortValue: (p) => p.name,
      render: (p) => <span className="font-medium text-text-primary">{p.name}</span>,
    },
    { key: "client", header: "Client", sortValue: (p) => p.client ?? "", render: (p) => p.client ?? <span className="text-text-tertiary">—</span> },
    {
      key: "health",
      header: "Health",
      align: "right",
      sortValue: (p) => p.health_score,
      render: (p) => <span className="font-tabular">{p.health_score}</span>,
    },
    {
      key: "budget",
      header: "Budget",
      align: "right",
      sortValue: (p) => p.budget,
      render: (p) => <span className="font-tabular">{formatCompactCurrency(p.budget)}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Executive Suite</h1>
        <p className="mt-1 text-sm text-text-tertiary">
          Product-prioritization and steering-committee tools, curated from real consulting and PMO data.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Value vs. Complexity Matrix</CardTitle>
            <CardDescription>
              Same 5×5 grid pattern as the project Risk Matrix, applied to every scored consulting opportunity across all
              business cases.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {opportunities.error ? (
            <ErrorState description={opportunities.error.message} onRetry={opportunities.reload} />
          ) : opportunities.loading ? (
            <div className="flex h-40 items-center justify-center">
              <Spinner />
            </div>
          ) : (opportunities.data ?? []).length === 0 ? (
            <EmptyState
              title="No scored opportunities yet"
              description="Score an AI/automation opportunity from a Consulting business case to see it plotted here."
            />
          ) : (
            <>
              <ValueComplexityMatrix opportunities={opportunities.data ?? []} />
              <div className="mt-6">
                <OpportunityTable rows={opportunities.data ?? []} onSelect={(o) => setSelection({ kind: "opportunity", opportunity: o })} />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <BoardroomSection projects={projects.data ?? []} loading={projects.loading} error={projects.error} isDemo={isDemo} />

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Portfolio Projects</CardTitle>
            <CardDescription>Click a project to open its real dependencies, risks, and audit trail</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {projects.error ? (
            <ErrorState description={projects.error.message} onRetry={projects.reload} />
          ) : (
            <DataTable
              columns={projectColumns}
              rows={projects.data ?? []}
              loading={projects.loading}
              getRowKey={(p) => p.id}
              emptyTitle="No projects yet"
              onRowClick={(p) => setSelection({ kind: "project", project: p })}
            />
          )}
        </CardContent>
      </Card>

      <DetailsInspector selection={selection} onClose={() => setSelection(null)} />
    </div>
  );
}

function OpportunityTable({ rows, onSelect }: { rows: OpportunityRow[]; onSelect: (o: OpportunityRow) => void }) {
  const columns: Column<OpportunityRow>[] = [
    { key: "name", header: "Opportunity", sortValue: (o) => o.name, render: (o) => <span className="font-medium text-text-primary">{o.name}</span> },
    { key: "case", header: "Business Case", sortValue: (o) => o.business_case_name, render: (o) => <span className="text-text-secondary">{o.business_case_name}</span> },
    { key: "value", header: "Value", align: "right", sortValue: (o) => o.business_impact, render: (o) => <span className="font-tabular">{o.business_impact}/5</span> },
    {
      key: "complexity",
      header: "Complexity",
      align: "right",
      sortValue: (o) => deriveComplexity(o),
      render: (o) => <span className="font-tabular">{deriveComplexity(o)}/5</span>,
    },
    {
      key: "score",
      header: "Overall Score",
      align: "right",
      sortValue: (o) => o.overall_score,
      render: (o) => <Badge tone={o.overall_score >= 60 ? "success" : o.overall_score >= 40 ? "warning" : "critical"}>{o.overall_score}/100</Badge>,
    },
  ];
  return <DataTable columns={columns} rows={rows} getRowKey={(o) => o.id} emptyTitle="No opportunities" onRowClick={onSelect} />;
}

function BoardroomSection({
  projects,
  loading,
  error,
  isDemo,
}: {
  projects: Project[];
  loading: boolean;
  error: Error | null;
  isDemo: boolean;
}) {
  const [projectId, setProjectId] = useState<string>("");
  const [memo, setMemo] = useState<BoardroomMemo | null>(null);
  const [evm, setEvm] = useState<EVM | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  async function generate() {
    if (!projectId) return;
    setGenerating(true);
    setGenError(null);
    try {
      const [memoResult, evmResult] = await Promise.all([
        pmoApi.generateBoardroomMemo(projectId),
        pmoApi.evm(projectId).catch(() => null),
      ]);
      setMemo(memoResult);
      setEvm(evmResult);
    } catch (err) {
      setGenError(err instanceof ApiError ? err.message : "Failed to generate the boardroom memo.");
    } finally {
      setGenerating(false);
    }
  }

  const selectedProject = projects.find((p) => p.id === projectId);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Boardroom Decision Cards</CardTitle>
          <CardDescription>
            Steering-committee brief for a project — real narrative plus 3 computed trade-off options
            (POST /api/v1/projects/&#123;id&#125;/boardroom-memo).
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="max-w-xs flex-1">
            <Select
              label="Project"
              placeholder={loading ? "Loading projects…" : "Choose a project"}
              value={projectId}
              onChange={(e) => {
                setProjectId(e.target.value);
                setMemo(null);
                setEvm(null);
              }}
              options={projects.map((p) => ({ label: p.name, value: p.id }))}
              disabled={loading || projects.length === 0}
            />
          </div>
          <Button onClick={generate} loading={generating} disabled={!projectId || generating}>
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            Generate Memo
          </Button>
        </div>

        {error && <ErrorState description={error.message} />}
        {genError && <p className="text-sm text-critical-fg">{genError}</p>}

        {!memo && !generating && (
          <EmptyState
            icon={<ClipboardList className="h-8 w-8" />}
            title="No memo generated yet"
            description="Pick a project and generate a boardroom memo — a fresh, real narrative plus 3 computed trade-off options."
          />
        )}

        {generating && !memo && (
          <div className="flex items-center justify-center py-10">
            <Spinner />
          </div>
        )}

        {memo && selectedProject && (
          <div className="space-y-5">
            <div className="rounded-lg border border-border-default bg-subtle/40 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-text-primary">{memo.project_name}</h3>
                  <p className="mt-1 text-sm text-text-secondary">{memo.narrative.summary}</p>
                </div>
                <AISourceBadge source={memo.narrative.source} />
              </div>
              {memo.narrative.detail && (
                <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-text-secondary">{memo.narrative.detail}</p>
              )}
              {evm && (
                <div className="mt-4 flex flex-wrap gap-4 border-t border-border-default pt-4 text-sm">
                  <span className="text-text-tertiary">
                    Financial variance (VAC):{" "}
                    <span className={cn("font-tabular font-semibold", evm.vac < 0 ? "text-critical-fg" : "text-success-fg")}>
                      {formatCurrency(evm.vac)}
                    </span>
                  </span>
                  <span className="text-text-tertiary">
                    CPI: <span className="font-tabular font-semibold text-text-primary">{evm.cpi != null ? evm.cpi.toFixed(2) : "—"}</span>
                  </span>
                  <span className="text-text-tertiary">
                    SPI: <span className="font-tabular font-semibold text-text-primary">{evm.spi != null ? evm.spi.toFixed(2) : "—"}</span>
                  </span>
                </div>
              )}
              <p className="mt-2 text-[11px] text-text-tertiary">Generated {formatDate(memo.generated_at)}</p>
            </div>

            <div>
              <h4 className="mb-3 text-sm font-semibold text-text-primary">Trade-off Options</h4>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                {memo.options.map((opt) => (
                  <Card key={opt.key} className="p-4">
                    <p className="text-sm font-semibold text-text-primary">{opt.title}</p>
                    <p className="mt-1 text-xs text-text-secondary">{opt.description}</p>
                    <div className="mt-3 space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-text-tertiary">New forecast</span>
                        <span className="font-tabular font-medium text-text-primary">{formatCurrency(opt.new_forecast_cost)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-text-tertiary">vs. budget</span>
                        <span className={cn("font-tabular font-medium", opt.variance_vs_budget > 0 ? "text-critical-fg" : "text-success-fg")}>
                          {opt.variance_vs_budget > 0 ? "+" : ""}
                          {formatCurrency(opt.variance_vs_budget)}
                        </span>
                      </div>
                    </div>
                    <ul className="mt-3 space-y-1 border-t border-border-default pt-2.5">
                      {opt.assumptions.map((a, i) => (
                        <li key={i} className="text-[11px] text-text-tertiary">
                          • {a}
                        </li>
                      ))}
                    </ul>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        )}

        {isDemo && <p className="text-[11px] text-text-tertiary">Memo generation is a computed read, not a write — it works in this view.</p>}
      </CardContent>
    </Card>
  );
}

function DetailsInspector({ selection, onClose }: { selection: Selection; onClose: () => void }) {
  if (!selection) {
    return <Drawer open={false} onClose={onClose} title="Details" />;
  }
  if (selection.kind === "opportunity") {
    return <OpportunityInspector opportunity={selection.opportunity} onClose={onClose} />;
  }
  return <ProjectInspector project={selection.project} onClose={onClose} />;
}

function OpportunityInspector({ opportunity, onClose }: { opportunity: OpportunityRow; onClose: () => void }) {
  const dims: { label: string; value: number }[] = [
    { label: "Business Impact", value: opportunity.business_impact },
    { label: "Feasibility", value: opportunity.feasibility },
    { label: "Data Readiness", value: opportunity.data_readiness },
    { label: "Cost", value: opportunity.cost },
    { label: "Time to Value", value: opportunity.time_to_value },
    { label: "Risk", value: opportunity.risk },
  ];
  return (
    <Drawer open onClose={onClose} title={opportunity.name} width="md">
      <div className="space-y-5">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">Business Case</p>
          <p className="mt-1 text-sm text-text-primary">{opportunity.business_case_name}</p>
        </div>
        {opportunity.description && (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">Description</p>
            <p className="mt-1 text-sm leading-relaxed text-text-secondary">{opportunity.description}</p>
          </div>
        )}
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-text-tertiary">Scored Dimensions</p>
          <dl className="grid grid-cols-2 gap-3">
            {dims.map((d) => (
              <div key={d.label} className="rounded-md border border-border-default px-3 py-2">
                <dt className="text-[11px] text-text-tertiary">{d.label}</dt>
                <dd className="font-tabular text-sm font-semibold text-text-primary">{d.value}/5</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="flex items-center justify-between rounded-md border border-border-default bg-subtle/50 px-3.5 py-3">
          <span className="text-sm text-text-secondary">Overall score</span>
          <Badge tone={opportunity.overall_score >= 60 ? "success" : opportunity.overall_score >= 40 ? "warning" : "critical"}>
            {opportunity.overall_score}/100
          </Badge>
        </div>
      </div>
    </Drawer>
  );
}

function ProjectInspector({ project, onClose }: { project: Project; onClose: () => void }) {
  const risks = useApi(() => api.risks(project.id), [project.id]);
  const tasks = useApi(() => api.tasks(project.id), [project.id]);
  const auditLogs = useApi(() => api.admin.auditLogs({ entityType: "project", pageSize: 50 }), [project.id]);

  const taskCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of tasks.data ?? []) counts[t.status] = (counts[t.status] ?? 0) + 1;
    return counts;
  }, [tasks.data]);

  const projectAuditLogs = useMemo(
    () => (auditLogs.data?.items ?? []).filter((e) => e.entity_id === project.id),
    [auditLogs.data, project.id],
  );

  return (
    <Drawer open onClose={onClose} title={project.name} width="md">
      <div className="space-y-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">Overview</p>
          <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-text-tertiary">Health score</p>
              <p className="font-tabular font-semibold text-text-primary">{project.health_score}</p>
            </div>
            <div>
              <p className="text-text-tertiary">Budget</p>
              <p className="font-tabular font-semibold text-text-primary">{formatCurrency(project.budget)}</p>
            </div>
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-text-tertiary">Tasks</p>
          {tasks.loading ? (
            <Spinner />
          ) : Object.keys(taskCounts).length === 0 ? (
            <p className="text-sm text-text-tertiary">No tasks yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {Object.entries(taskCounts).map(([status, count]) => (
                <Badge key={status} tone={taskStatusTone(status)}>
                  {titleCase(status)}: {count}
                </Badge>
              ))}
            </div>
          )}
        </div>

        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-text-tertiary">Risks</p>
          {risks.loading ? (
            <Spinner />
          ) : (risks.data ?? []).length === 0 ? (
            <p className="text-sm text-text-tertiary">No open risks.</p>
          ) : (
            <ul className="space-y-2">
              {(risks.data as Risk[]).map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 rounded-md border border-border-default px-3 py-2 text-sm">
                  <span className="text-text-primary">{r.title}</span>
                  <Badge tone={riskLevelTone(r.severity)}>{r.severity}</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-text-tertiary">Audit Trail</p>
          {auditLogs.error instanceof ApiError && auditLogs.error.status === 403 ? (
            <EmptyState
              icon={<ShieldAlert className="h-6 w-6" />}
              title="Admin access required"
              description="The audit trail is only visible to admin accounts."
            />
          ) : auditLogs.loading ? (
            <Spinner />
          ) : projectAuditLogs.length === 0 ? (
            <p className="text-sm text-text-tertiary">No audit events recorded for this project yet.</p>
          ) : (
            <ul className="space-y-2">
              {projectAuditLogs.slice(0, 10).map((e) => (
                <li key={e.id} className="rounded-md border border-border-default px-3 py-2 text-xs">
                  <span className="font-medium text-text-primary">{e.action}</span>
                  <span className="ml-2 text-text-tertiary">{formatDate(e.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {(tasks.error || risks.error) && (
          <div className="flex items-center gap-2 rounded-md border border-warning-border bg-warning-bg px-3 py-2 text-xs text-warning-fg">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Some sections failed to load.
          </div>
        )}
      </div>
    </Drawer>
  );
}
