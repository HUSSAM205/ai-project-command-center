"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { Risk } from "@/lib/types";

function severityFromScore(score: number): "success" | "warning" | "high" | "critical" {
  if (score <= 4) return "success";
  if (score <= 9) return "warning";
  if (score <= 16) return "high";
  return "critical";
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
 * 5x5 probability (rows, high-to-low top-to-bottom) x impact (columns, low-to-high left-to-right)
 * grid. Cells are colored/counted by severity derived from probability * impact, matching the
 * backend's risk-severity thresholds.
 */
export function RiskMatrix({ risks, onSelect }: { risks: Risk[]; onSelect?: (cell: { p: number; i: number } | null) => void }) {
  const [selected, setSelectedState] = useState<{ p: number; i: number } | null>(null);
  function setSelected(cell: { p: number; i: number } | null) {
    setSelectedState(cell);
    onSelect?.(cell);
  }

  const grid = useMemo(() => {
    const map = new Map<string, Risk[]>();
    for (const r of risks) {
      const key = `${r.probability}-${r.impact}`;
      const list = map.get(key) ?? [];
      list.push(r);
      map.set(key, list);
    }
    return map;
  }, [risks]);

  const probLevels = [5, 4, 3, 2, 1];
  const impactLevels = [1, 2, 3, 4, 5];

  const selectedRisks = selected ? grid.get(`${selected.p}-${selected.i}`) ?? [] : [];

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <div>
        <div className="flex">
          <div className="flex w-8 flex-col items-center justify-center">
            <span className="rotate-180 text-[11px] font-medium tracking-wide text-text-tertiary [writing-mode:vertical-rl]">
              Probability
            </span>
          </div>
          <div>
            <div
              className="grid gap-1"
              style={{ gridTemplateColumns: `repeat(${impactLevels.length}, 56px)` }}
              role="group"
              aria-label="Risk probability by impact matrix"
            >
              {probLevels.map((p) =>
                impactLevels.map((i) => {
                  const score = p * i;
                  const sev = severityFromScore(score);
                  const cellRisks = grid.get(`${p}-${i}`) ?? [];
                  const isSelected = selected?.p === p && selected?.i === i;
                  return (
                    <button
                      key={`${p}-${i}`}
                      type="button"
                      onClick={() => setSelected(isSelected ? null : { p, i })}
                      aria-pressed={isSelected}
                      aria-label={`Probability ${p}, impact ${i}, score ${score}, ${cellRisks.length} risk${cellRisks.length === 1 ? "" : "s"}`}
                      className={cn(
                        "flex h-14 w-14 flex-col items-center justify-center rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
                        cellBg[sev],
                        isSelected ? "border-text-primary ring-2 ring-[var(--focus-ring)]" : "border-transparent",
                      )}
                    >
                      <span className={cn("text-base font-semibold font-tabular", cellText[sev])}>
                        {cellRisks.length > 0 ? cellRisks.length : ""}
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
            <p className="mt-1 text-center text-[11px] font-medium tracking-wide text-text-tertiary">Impact</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-text-tertiary">
          <LegendDot tone="success" label="Low" />
          <LegendDot tone="warning" label="Medium" />
          <LegendDot tone="high" label="High" />
          <LegendDot tone="critical" label="Critical" />
        </div>
      </div>

      <div className="min-w-[220px] flex-1 rounded-lg border border-border-default bg-surface p-4">
        {selected ? (
          <>
            <h4 className="text-sm font-semibold text-text-primary">
              Probability {selected.p} × Impact {selected.i}
            </h4>
            {selectedRisks.length === 0 ? (
              <p className="mt-2 text-sm text-text-tertiary">No risks in this cell.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {selectedRisks.map((r) => (
                  <li key={r.id} className="text-sm text-text-primary">
                    <span className="font-medium">{r.title}</span>
                    <span className="block text-xs text-text-tertiary">{r.category} · {r.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="text-sm text-text-tertiary">Select a cell to see the risks plotted there.</p>
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
