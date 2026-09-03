"use client";

import { useMemo } from "react";
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip as RTooltip } from "recharts";
import type { Risk } from "@/lib/types";
import { titleCase } from "@/lib/utils";
import { EmptyState } from "@/components/ui/EmptyState";

const tooltipStyle = {
  background: "var(--bg-surface-raised)",
  border: "1px solid var(--border-default)",
  borderRadius: 10,
  fontSize: 12,
  color: "var(--text-primary)",
  boxShadow: "var(--shadow-elevation-2)",
};

/**
 * Alternative lens on the same risk register the severity donut/matrix already render: category
 * on the angular axis, sum of (probability x impact) per category — the same score field every
 * other risk view uses — on the radial axis. No new/fabricated metric, just a different
 * aggregation of real Risk[] data already fetched by the caller.
 */
export function RiskRadar({ risks }: { risks: Risk[] }) {
  const data = useMemo(() => {
    const byCategory = new Map<string, number>();
    for (const r of risks) {
      byCategory.set(r.category, (byCategory.get(r.category) ?? 0) + r.score);
    }
    return [...byCategory.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([category, score]) => ({ category: titleCase(category), score }));
  }, [risks]);

  if (data.length === 0) {
    return <EmptyState title="No risks recorded" />;
  }

  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} outerRadius="72%">
          <defs>
            <radialGradient id="riskRadarFill">
              <stop offset="0%" stopColor="var(--brand-500)" stopOpacity={0.42} />
              <stop offset="100%" stopColor="var(--brand-500)" stopOpacity={0.08} />
            </radialGradient>
          </defs>
          <PolarGrid stroke="var(--border-default)" />
          <PolarAngleAxis dataKey="category" tick={{ fontSize: 10, fill: "var(--text-tertiary)" }} />
          <PolarRadiusAxis tick={{ fontSize: 9, fill: "var(--text-tertiary)" }} axisLine={false} tickCount={4} allowDecimals={false} />
          <Radar dataKey="score" stroke="var(--brand-500)" fill="url(#riskRadarFill)" strokeWidth={2} dot={{ r: 2.5, fill: "var(--brand-500)", strokeWidth: 0 }} />
          <RTooltip contentStyle={tooltipStyle} formatter={(v) => [String(v), "Severity-weighted score"]} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
