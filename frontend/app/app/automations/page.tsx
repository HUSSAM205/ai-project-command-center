"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Bell,
  Clock,
  DollarSign,
  History,
  RefreshCw,
  ShieldAlert,
  ShieldPlus,
  Workflow,
  Zap,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import type { AutomationLog, AutomationOutcome, AutomationRule, AutomationTriggerType, AutomationActionType } from "@/lib/types";
import { Badge, type SemanticTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Drawer } from "@/components/ui/Drawer";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/LoadingState";
import { useToast } from "@/components/ui/Toast";
import { formatDate, titleCase } from "@/lib/utils";

const TRIGGER_ICON: Record<AutomationTriggerType, typeof AlertTriangle> = {
  TASK_OVERDUE: Clock,
  BUDGET_BURNOVER: DollarSign,
  CRITICAL_RISK_SPOTTED: ShieldAlert,
};

const ACTION_ICON: Record<AutomationActionType, typeof AlertTriangle> = {
  AUTO_CREATE_RISK: ShieldPlus,
  DISPATCH_NOTIFICATION: Bell,
  RECALCULATE_HEALTH: RefreshCw,
};

const OUTCOME_TONE: Record<AutomationOutcome, SemanticTone> = {
  FIRED: "success",
  CONDITION_NOT_MET: "neutral",
  ERROR: "critical",
};

function label(value: string): string {
  return titleCase(value.replace(/_/g, " "));
}

export default function AutomationsPage() {
  const rulesApi = useApi(() => api.automations(), []);
  const { push } = useToast();

  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, AutomationLog>>({});
  const [localRules, setLocalRules] = useState<AutomationRule[] | null>(null);
  const [logDrawerRule, setLogDrawerRule] = useState<AutomationRule | null>(null);

  const rules = localRules ?? rulesApi.data ?? [];

  function patchRule(updated: AutomationRule) {
    setLocalRules(rules.map((r) => (r.id === updated.id ? updated : r)));
  }

  async function toggle(rule: AutomationRule) {
    setTogglingId(rule.id);
    try {
      const updated = await api.toggleAutomation(rule.id);
      patchRule(updated);
      push(updated.is_active ? `${rule.name} enabled` : `${rule.name} disabled`, "success");
    } catch (err) {
      push(err instanceof ApiError ? err.message : "Could not toggle this rule.", "error");
    } finally {
      setTogglingId(null);
    }
  }

  async function testRun(rule: AutomationRule) {
    setTestingId(rule.id);
    try {
      const log = await api.testRunAutomation(rule.id);
      setTestResults((prev) => ({ ...prev, [rule.id]: log }));
      if (log.outcome === "FIRED") {
        patchRule({ ...rule, last_triggered_at: log.triggered_at });
        push(`${rule.name}: fired — check the notification bell`, "success");
      } else if (log.outcome === "CONDITION_NOT_MET") {
        push(`${rule.name}: condition not currently met`, "success");
      } else {
        push(`${rule.name}: evaluation failed`, "error");
      }
    } catch (err) {
      push(err instanceof ApiError ? err.message : "Could not test-run this rule.", "error");
    } finally {
      setTestingId(null);
    }
  }

  if (rulesApi.loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (rulesApi.error && rules.length === 0) {
    return <ErrorState title="Couldn't load automations" description={rulesApi.error.message} onRetry={rulesApi.reload} />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold text-text-primary">
          <Zap className="h-5 w-5 text-brand-600 dark:text-brand-300" aria-hidden="true" />
          Automation Rules Center
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-text-tertiary">
          The 3 standard enterprise triggers, evaluated for real against real current data — either lazily whenever the
          notification feed is polled, or immediately via Test Trigger below. This deployment has no background
          scheduler, so a rule only re-checks on real traffic, not on a fixed clock.
        </p>
      </div>

      {rules.length === 0 ? (
        <EmptyState title="No automation rules configured" />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {rules.map((rule) => {
            const TriggerIcon = TRIGGER_ICON[rule.trigger_type];
            const ActionIcon = ACTION_ICON[rule.action_type];
            const result = testResults[rule.id];
            return (
              <Card key={rule.id}>
                <CardHeader>
                  <div>
                    <CardTitle>{rule.name}</CardTitle>
                    <CardDescription>
                      {rule.last_triggered_at ? `Last fired ${formatDate(rule.last_triggered_at)}` : "Never fired"}
                    </CardDescription>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={rule.is_active}
                    aria-label={rule.is_active ? "Disable rule" : "Enable rule"}
                    onClick={() => toggle(rule)}
                    disabled={togglingId === rule.id}
                    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
                      rule.is_active ? "bg-brand-600 dark:bg-brand-500" : "bg-subtle border border-border-default"
                    }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                        rule.is_active ? "translate-x-[18px]" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="warning">
                      <TriggerIcon className="h-3 w-3" aria-hidden="true" /> {label(rule.trigger_type)}
                    </Badge>
                    <span className="text-text-tertiary">→</span>
                    <Badge tone="info">
                      <ActionIcon className="h-3 w-3" aria-hidden="true" /> {label(rule.action_type)}
                    </Badge>
                  </div>

                  {result && (
                    <div
                      className={`rounded-md border p-2.5 text-xs ${
                        result.outcome === "FIRED"
                          ? "border-success-border bg-success-bg text-success-fg"
                          : result.outcome === "ERROR"
                            ? "border-critical-border bg-critical-bg text-critical-fg"
                            : "border-border-default bg-subtle text-text-secondary"
                      }`}
                    >
                      <p className="font-medium">
                        <Badge tone={OUTCOME_TONE[result.outcome]} dot>
                          {label(result.outcome)}
                        </Badge>
                      </p>
                      {result.detail && <p className="mt-1.5 leading-relaxed">{result.detail}</p>}
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <Button size="sm" onClick={() => testRun(rule)} loading={testingId === rule.id} disabled={testingId !== null}>
                      <Workflow className="h-3.5 w-3.5" aria-hidden="true" /> Test Trigger
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setLogDrawerRule(rule)}>
                      <History className="h-3.5 w-3.5" aria-hidden="true" /> Execution Log
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <ExecutionLogDrawer rule={logDrawerRule} onClose={() => setLogDrawerRule(null)} />
    </div>
  );
}

function ExecutionLogDrawer({ rule, onClose }: { rule: AutomationRule | null; onClose: () => void }) {
  const logsApi = useApi(() => (rule ? api.automationLogs(rule.id) : Promise.resolve<AutomationLog[]>([])), [rule?.id]);

  return (
    <Drawer open={rule !== null} onClose={onClose} title={rule ? `Execution Log — ${rule.name}` : "Execution Log"} width="lg">
      {logsApi.loading ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : logsApi.error ? (
        <ErrorState description={logsApi.error.message} onRetry={logsApi.reload} />
      ) : !logsApi.data || logsApi.data.length === 0 ? (
        <EmptyState title="No evaluations yet" description="This rule hasn't been checked yet — it will be the first time it's polled or test-run." />
      ) : (
        <ul className="space-y-2">
          {logsApi.data.map((log) => (
            <li key={log.id} className="rounded-md border border-border-default bg-subtle/40 p-3">
              <div className="flex items-center justify-between gap-2">
                <Badge tone={OUTCOME_TONE[log.outcome]} dot>
                  {label(log.outcome)}
                </Badge>
                <span className="font-tabular text-xs text-text-tertiary">{formatDate(log.triggered_at)}</span>
              </div>
              {log.detail && <p className="mt-1.5 text-xs leading-relaxed text-text-secondary">{log.detail}</p>}
            </li>
          ))}
        </ul>
      )}
    </Drawer>
  );
}
