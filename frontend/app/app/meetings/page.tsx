"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, ClipboardCheck, Mic, ShieldPlus, Upload, UserRound } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useToast } from "@/components/ui/Toast";
import type { AISource, MeetingParseData, MeetingRisk } from "@/lib/types";
import { AISourceBadge, Badge, priorityTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { RiskFormModal } from "@/components/forms/RiskFormModal";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Input";
import { formatDate, titleCase } from "@/lib/utils";

const SAMPLE_TRANSCRIPT = `Sarah Chen: Let's kick off the sprint review.
Sarah Chen: We decided to proceed with the Cloud Migration Initiative timeline as planned.
Robert Garcia: Agreed to move the budget review up a week given finance's request.
Priya Patel: Action item: Priya will draft the updated risk register by next Friday.
Oliver Bennett: I'm concerned about the vendor contract renewal -- it could delay the integration work if it slips past October.
Samuel Okafor: Action item: prepare the security audit checklist. Owner: Samuel Okafor. Due: end of month. High priority.
Sarah Chen: We are also worried about resource bandwidth on the data team next sprint -- that's a real risk to the delivery date.`;

export default function MeetingsPage() {
  const projectsApi = useApi(() => api.projects(), []);
  const { push } = useToast();

  const [transcript, setTranscript] = useState("");
  const [projectId, setProjectId] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [result, setResult] = useState<MeetingParseData | null>(null);
  const [resultSource, setResultSource] = useState<AISource | null>(null);

  const [checkedTitles, setCheckedTitles] = useState<Set<string>>(new Set());
  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [committedTitles, setCommittedTitles] = useState<Set<string>>(new Set());
  const [unresolvedOwners, setUnresolvedOwners] = useState<string[] | null>(null);

  const [riskDraft, setRiskDraft] = useState<MeetingRisk | null>(null);
  const [addedRisks, setAddedRisks] = useState<Set<string>>(new Set());

  const actionItems = useMemo(() => result?.action_items ?? [], [result]);
  const committableItems = useMemo(
    () => actionItems.filter((item) => checkedTitles.has(item.title) && !committedTitles.has(item.title)),
    [actionItems, checkedTitles, committedTitles],
  );

  function toggleItem(title: string) {
    setCheckedTitles((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".txt")) {
      push("Only plain-text (.txt) transcripts can be uploaded directly -- paste the text for other formats.", "error");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setTranscript(String(reader.result ?? ""));
    reader.onerror = () => push("Could not read that file.", "error");
    reader.readAsText(file);
  }

  async function analyzeMeeting() {
    const text = transcript.trim();
    if (!text || parsing) return;
    setParsing(true);
    setParseError(null);
    setResult(null);
    setCommitError(null);
    setUnresolvedOwners(null);
    setCommittedTitles(new Set());
    try {
      const response = await api.parseMeetingTranscript(text);
      const data = response.data as unknown as MeetingParseData;
      setResult(data);
      setResultSource(response.source);
      setCheckedTitles(new Set(data.action_items.map((item) => item.title)));
    } catch (err) {
      setParseError(err instanceof ApiError ? err.message : "Could not analyze this transcript.");
    } finally {
      setParsing(false);
    }
  }

  async function commitTasks() {
    if (!projectId || committableItems.length === 0 || committing) return;
    setCommitting(true);
    setCommitError(null);
    try {
      const response = await api.commitMeetingTasks(projectId, committableItems);
      setCommittedTitles((prev) => {
        const next = new Set(prev);
        committableItems.forEach((item) => next.add(item.title));
        return next;
      });
      setUnresolvedOwners(response.unresolved_owners);
      push(
        `${response.created_tasks.length} task${response.created_tasks.length === 1 ? "" : "s"} committed to the project WBS`,
        "success",
      );
    } catch (err) {
      setCommitError(err instanceof ApiError ? err.message : "Could not commit these tasks.");
    } finally {
      setCommitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold text-text-primary">
          <Mic className="h-5 w-5 text-brand-600 dark:text-brand-300" aria-hidden="true" />
          Meeting Intelligence
        </h1>
        <p className="mt-1 text-sm text-text-tertiary">
          Paste a meeting transcript to extract real decisions, action items, and risks -- then commit approved
          action items straight into a project&rsquo;s work breakdown structure.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Transcript</CardTitle>
            <CardDescription>Paste notes or a transcript, or upload a plain-text (.txt) file.</CardDescription>
          </div>
          <label className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-border-default px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-brand-500 hover:text-brand-700 dark:hover:text-brand-300">
            <Upload className="h-3.5 w-3.5" aria-hidden="true" />
            Upload .txt
            <input type="file" accept=".txt,text/plain" className="hidden" onChange={handleFileUpload} />
          </label>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder="Paste the meeting transcript or notes here…"
            className="min-h-[180px]"
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setTranscript(SAMPLE_TRANSCRIPT)}
              className="text-xs font-medium text-text-tertiary underline decoration-dotted underline-offset-2 hover:text-text-secondary"
            >
              Load a sample transcript
            </button>
            <Button onClick={analyzeMeeting} loading={parsing} disabled={!transcript.trim()}>
              <Mic className="h-4 w-4" aria-hidden="true" />
              Analyze Meeting
            </Button>
          </div>
          {parseError && <p className="text-sm text-critical-fg">{parseError}</p>}
        </CardContent>
      </Card>

      {result && (
        <>
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Executive Decisions</CardTitle>
                <CardDescription>Resolutions extracted directly from the transcript.</CardDescription>
              </div>
              {resultSource && <AISourceBadge source={resultSource} />}
            </CardHeader>
            <CardContent>
              {result.decisions.length === 0 ? (
                <EmptyState title="No decisions detected" description="No resolution-style language was found in this transcript." />
              ) : (
                <ul className="space-y-2">
                  {result.decisions.map((d, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-text-secondary">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success-fg" aria-hidden="true" />
                      {d}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-1.5">
                  <ClipboardCheck className="h-4 w-4 text-brand-600 dark:text-brand-300" aria-hidden="true" />
                  Action Items
                </CardTitle>
                <CardDescription>Select the items to commit, choose a project, then commit to its WBS.</CardDescription>
              </div>
              <Select
                className="w-64"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                options={(projectsApi.data ?? []).map((p) => ({ label: p.name, value: p.id }))}
                placeholder={projectsApi.loading ? "Loading projects…" : "Target project"}
                disabled={projectsApi.loading}
              />
            </CardHeader>
            <CardContent className="space-y-4">
              {actionItems.length === 0 ? (
                <EmptyState title="No action items detected" description="No task-style language was found in this transcript." />
              ) : (
                <ul className="space-y-2">
                  {actionItems.map((item) => {
                    const committed = committedTitles.has(item.title);
                    return (
                      <li
                        key={item.title}
                        className="flex items-start gap-3 rounded-md border border-border-default bg-subtle/40 p-3"
                      >
                        <input
                          type="checkbox"
                          checked={checkedTitles.has(item.title)}
                          onChange={() => toggleItem(item.title)}
                          disabled={committed}
                          className="mt-1 h-4 w-4 shrink-0 rounded border-border-default"
                          aria-label={`Include "${item.title}"`}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-text-primary">{item.title}</p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-text-tertiary">
                            <Badge tone={priorityTone(item.priority)}>{titleCase(item.priority)}</Badge>
                            <span className="flex items-center gap-1">
                              <UserRound className="h-3 w-3" aria-hidden="true" />
                              {item.owner_name ?? "Unassigned"}
                            </span>
                            <span>{item.due_date ? formatDate(item.due_date) : "No due date"}</span>
                            {item.estimated_hours != null && <span>~{item.estimated_hours.toFixed(0)}h</span>}
                          </div>
                        </div>
                        {committed && (
                          <Badge tone="success" dot className="shrink-0">
                            Committed
                          </Badge>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              {commitError && <p className="text-sm text-critical-fg">{commitError}</p>}
              {unresolvedOwners && unresolvedOwners.length > 0 && (
                <p className="text-xs text-warning-fg">
                  Could not match to a real resource, created unassigned: {unresolvedOwners.join(", ")}
                </p>
              )}

              <div className="flex justify-end">
                <Button
                  onClick={commitTasks}
                  loading={committing}
                  disabled={!projectId || committableItems.length === 0}
                >
                  <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
                  Commit Tasks to Project WBS
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Risks Identified</CardTitle>
                <CardDescription>Concerns raised during the discussion -- add any of these to a project&rsquo;s risk register.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {result.risks_identified.length === 0 ? (
                <EmptyState title="No risks detected" description="No risk-style language was found in this transcript." />
              ) : (
                <ul className="space-y-2">
                  {result.risks_identified.map((r, i) => (
                    <li key={i} className="flex items-start justify-between gap-3 text-sm">
                      <span className="flex items-start gap-2 text-text-secondary">
                        <Badge tone="critical" className="mt-0.5 shrink-0">
                          {titleCase(r.category)}
                        </Badge>
                        {r.description}
                      </span>
                      {addedRisks.has(r.description) ? (
                        <span className="shrink-0 text-[11px] font-medium text-success-fg">Added</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setRiskDraft(r)}
                          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border-default px-1.5 py-0.5 text-[11px] font-medium text-text-tertiary transition-colors hover:border-critical-border hover:text-critical-fg"
                        >
                          <ShieldPlus className="h-3 w-3" aria-hidden="true" /> Add to Risk Register
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <RiskFormModal
        key={riskDraft?.description ?? "closed"}
        open={riskDraft !== null}
        onClose={() => setRiskDraft(null)}
        projectId={projectId || undefined}
        projects={projectsApi.data ?? undefined}
        prefillTitle={riskDraft?.description}
        onSaved={(_risk, simulated) => {
          if (riskDraft) setAddedRisks((prev) => new Set(prev).add(riskDraft.description));
          push(simulated ? "Risk added — sandbox only, not saved" : "Risk added to the register", "success");
          setRiskDraft(null);
        }}
      />
    </div>
  );
}
