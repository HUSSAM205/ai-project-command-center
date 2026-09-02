"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { AIOpportunity } from "@/lib/types";

/** Same severity-band thresholds as RiskMatrix's probability×impact score (1-25 range,
 * scored here as business_impact × feasibility) — reused deliberately so "priority" here reads
 * on the same visual scale a user already knows from the Risk Matrix. */
function priorityFromScore(score: number): "success" | "warning" | "high" | "critical" {
  if (score <= 4) return "critical"; // low impact AND low feasibility — thankless work
  if (score <= 9) return "warning";
  if (score <= 16) return "high";
  return "success"; // high impact AND high feasibility — quick wins
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

/**
 * 5x5 feasibility (rows, high-to-low top-to-bottom) x business impact (columns, low-to-high
 * left-to-right) grid — structurally the same pattern as components/viz/RiskMatrix.tsx's
 * probability×impact grid, just plotting a different pair of dimensions from
 * app/services/opportunity_scoring.py's 6-dimension score.
 */
export function ImpactFeasibilityMatrix({ opportunities }: { opportunities: AIOpportunity[] }) {
  const [selected, setSelected] = useState<{ impact: number; feasibility: number } | null>(null);

  const grid = useMemo(() => {
    const map = new Map<string, AIOpportunity[]>();
    for (const o of opportunities) {
      const key = `${o.business_impact}-${o.feasibility}`;
      const list = map.get(key) ?? [];
      list.push(o);
      map.set(key, list);
    }
    return map;
  }, [opportunities]);

  const feasibilityLevels = [5, 4, 3, 2, 1];
  const impactLevels = [1, 2, 3, 4, 5];

  const selectedOpportunities = selected ? grid.get(`${selected.impact}-${selected.feasibility}`) ?? [] : [];

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <div>
        <div className="flex">
          <div className="flex w-8 flex-col items-center justify-center">
            <span className="rotate-180 text-[11px] font-medium tracking-wide text-text-tertiary [writing-mode:vertical-rl]">
              Feasibility
            </span>
          </div>
          <div>
            <div
              className="grid gap-1"
              style={{ gridTemplateColumns: `repeat(${impactLevels.length}, 56px)` }}
              role="group"
              aria-label="Opportunity impact by feasibility matrix"
            >
              {feasibilityLevels.map((feasibility) =>
                impactLevels.map((impact) => {
                  const score = impact * feasibility;
                  const tone = priorityFromScore(score);
                  const cellOpportunities = grid.get(`${impact}-${feasibility}`) ?? [];
                  const isSelected = selected?.impact === impact && selected?.feasibility === feasibility;
                  return (
                    <button
                      key={`${impact}-${feasibility}`}
                      type="button"
                      onClick={() => setSelected(isSelected ? null : { impact, feasibility })}
                      aria-pressed={isSelected}
                      aria-label={`Impact ${impact}, feasibility ${feasibility}, ${cellOpportunities.length} opportunit${cellOpportunities.length === 1 ? "y" : "ies"}`}
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
              style={{ gridTemplateColumns: `repeat(${impactLevels.length}, 56px)` }}
            >
              {impactLevels.map((i) => (
                <span key={i}>{i}</span>
              ))}
            </div>
            <p className="mt-1 text-center text-[11px] font-medium tracking-wide text-text-tertiary">Business Impact</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-text-tertiary">
          <LegendDot tone="success" label="Quick win" />
          <LegendDot tone="high" label="High priority" />
          <LegendDot tone="warning" label="Fill-in" />
          <LegendDot tone="critical" label="Low priority" />
        </div>
      </div>

      <div className="min-w-[220px] flex-1 rounded-lg border border-border-default bg-surface p-4">
        {selected ? (
          <>
            <h4 className="text-sm font-semibold text-text-primary">
              Impact {selected.impact} × Feasibility {selected.feasibility}
            </h4>
            {selectedOpportunities.length === 0 ? (
              <p className="mt-2 text-sm text-text-tertiary">No opportunities in this cell.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {selectedOpportunities.map((o) => (
                  <li key={o.id} className="text-sm text-text-primary">
                    <span className="font-medium">{o.name}</span>
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
