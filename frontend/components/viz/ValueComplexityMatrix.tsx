"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { AIOpportunity } from "@/lib/types";

/**
 * Value vs. Complexity priority matrix for the Executive Suite workspace — structurally the
 * exact same 5x5 grid pattern as components/viz/ImpactFeasibilityMatrix.tsx (itself modeled on
 * RiskMatrix.tsx), just plotting a different pair of axes derived from the same real
 * AIOpportunity fields (app/services/opportunity_scoring.py) rather than a new backend field.
 *
 * Axes (both real, no invented backend data):
 *   Value      = business_impact (1-5, as scored) — unchanged.
 *   Complexity = round(((6 - feasibility) + cost) / 2), clamped to 1-5.
 *                Inverse of feasibility (low feasibility -> harder -> higher complexity),
 *                averaged with cost (high cost -> higher complexity). Both are real 1-5 fields
 *                already captured on every opportunity; this is a documented client-side
 *                derivation, not a new scored dimension persisted anywhere.
 *
 * Rows run complexity 1 (top, simplest) -> 5 (bottom, hardest) so the top-right of the grid
 * reads as "quick wins" (high value, low complexity) and the bottom-left as "low priority"
 * (low value, high complexity) — the conventional value/complexity quadrant reading.
 */
export function deriveComplexity(o: Pick<AIOpportunity, "feasibility" | "cost">): number {
  const raw = Math.round((6 - o.feasibility + o.cost) / 2);
  return Math.min(5, Math.max(1, raw));
}

function priorityFromScore(score: number): "success" | "warning" | "high" | "critical" {
  if (score >= 17) return "success"; // high value, low complexity — quick win
  if (score >= 10) return "high";
  if (score >= 5) return "warning";
  return "critical"; // low value, high complexity — avoid
}

const cellBg: Record<string, string> = {
  success: "bg-success-bg hover:bg-success-border/40",
  warning: "bg-warning-bg hover:bg-warning-border/40",
  high: "bg-high-bg hover:bg-high-border/40",
  critical: "bg-critical-bg hover:bg-critical-border/40",
};

const cellText: Record<string, string> = {
  success: "text-success-fg",
  warning: "text-warning-fg",
  high: "text-high-fg",
  critical: "text-critical-fg",
};

export function ValueComplexityMatrix({
  opportunities,
}: {
  opportunities: (AIOpportunity & { business_case_name?: string })[];
}) {
  const [selected, setSelected] = useState<{ value: number; complexity: number } | null>(null);

  const enriched = useMemo(
    () => opportunities.map((o) => ({ ...o, complexity: deriveComplexity(o) })),
    [opportunities],
  );

  const grid = useMemo(() => {
    const map = new Map<string, typeof enriched>();
    for (const o of enriched) {
      const key = `${o.business_impact}-${o.complexity}`;
      const list = map.get(key) ?? [];
      list.push(o);
      map.set(key, list);
    }
    return map;
  }, [enriched]);

  const complexityLevels = [1, 2, 3, 4, 5];
  const valueLevels = [1, 2, 3, 4, 5];

  const selectedOpportunities = selected ? grid.get(`${selected.value}-${selected.complexity}`) ?? [] : [];

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <div>
        <div className="flex">
          <div className="flex w-8 flex-col items-center justify-center">
            <span className="rotate-180 text-[11px] font-medium tracking-wide text-text-tertiary [writing-mode:vertical-rl]">
              Complexity
            </span>
          </div>
          <div>
            <div
              className="grid gap-1"
              style={{ gridTemplateColumns: `repeat(${valueLevels.length}, 56px)` }}
              role="group"
              aria-label="Opportunity value by complexity matrix"
            >
              {complexityLevels.map((complexity) =>
                valueLevels.map((value) => {
                  const score = value * (6 - complexity);
                  const tone = priorityFromScore(score);
                  const cellOpportunities = grid.get(`${value}-${complexity}`) ?? [];
                  const isSelected = selected?.value === value && selected?.complexity === complexity;
                  return (
                    <button
                      key={`${value}-${complexity}`}
                      type="button"
                      onClick={() => setSelected(isSelected ? null : { value, complexity })}
                      aria-pressed={isSelected}
                      aria-label={`Value ${value}, complexity ${complexity}, ${cellOpportunities.length} opportunit${cellOpportunities.length === 1 ? "y" : "ies"}`}
                      className={cn(
                        "flex h-14 w-14 flex-col items-center justify-center rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
                        cellBg[tone],
                        isSelected ? "border-text-primary ring-2 ring-[var(--focus-ring)]" : "border-transparent",
                      )}
                    >
                      <span className={cn("text-base font-semibold font-tabular", cellText[tone])}>
                        {cellOpportunities.length > 0 ? cellOpportunities.length : ""}
                      </span>
                      <span className="text-[10px] text-text-tertiary font-tabular">{score}</span>
                    </button>
                  );
                }),
              )}
            </div>
            <div
              className="mt-1 grid gap-1 text-center text-[11px] font-medium text-text-tertiary"
              style={{ gridTemplateColumns: `repeat(${valueLevels.length}, 56px)` }}
            >
              {valueLevels.map((v) => (
                <span key={v}>{v}</span>
              ))}
            </div>
            <p className="mt-1 text-center text-[11px] font-medium tracking-wide text-text-tertiary">Business Value</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-text-tertiary">
          <LegendDot tone="success" label="Quick win" />
          <LegendDot tone="high" label="Major project" />
          <LegendDot tone="warning" label="Fill-in" />
          <LegendDot tone="critical" label="Avoid" />
        </div>
        <p className="mt-2 max-w-md text-[11px] leading-relaxed text-text-tertiary">
          Value = business impact (1-5, as scored). Complexity = round(((6 - feasibility) + cost) / 2), clamped
          1-5 — both derived client-side from real scored fields on each opportunity, not a new backend field.
        </p>
      </div>

      <div className="min-w-[220px] flex-1 rounded-lg border border-border-default bg-surface p-4">
        {selected ? (
          <>
            <h4 className="text-sm font-semibold text-text-primary">
              Value {selected.value} × Complexity {selected.complexity}
            </h4>
            {selectedOpportunities.length === 0 ? (
              <p className="mt-2 text-sm text-text-tertiary">No opportunities in this cell.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {selectedOpportunities.map((o) => (
                  <li key={o.id} className="text-sm text-text-primary">
                    <span className="font-medium">{o.name}</span>
                    {o.business_case_name && (
                      <span className="block text-xs text-text-tertiary">{o.business_case_name}</span>
                    )}
                    <span className="block text-xs text-text-tertiary">Overall score {o.overall_score}/100</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="text-sm text-text-tertiary">Select a cell to see the opportunities plotted there.</p>
        )}
      </div>
    </div>
  );
}

function LegendDot({ tone, label }: { tone: keyof typeof cellText; label: string }) {
  const dotBg: Record<string, string> = {
    success: "bg-success-solid",
    warning: "bg-warning-solid",
    high: "bg-high-solid",
    critical: "bg-critical-solid",
  };
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("h-2.5 w-2.5 rounded-sm", dotBg[tone])} /> {label}
    </span>
  );
}
