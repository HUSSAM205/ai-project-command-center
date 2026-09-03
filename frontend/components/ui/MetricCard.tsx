import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Card } from "./Card";

export function MetricCard({
  label,
  value,
  delta,
  deltaTone = "neutral",
  icon,
  hint,
  className,
}: {
  label: string;
  value: ReactNode;
  delta?: string;
  deltaTone?: "success" | "critical" | "neutral";
  icon?: ReactNode;
  hint?: string;
  className?: string;
}) {
  const deltaColor =
    deltaTone === "success" ? "text-success-fg" : deltaTone === "critical" ? "text-critical-fg" : "text-text-tertiary";

  return (
    // A step richer than the base Card (which is already glass as of this pass): a KPI tile is
    // one large high-contrast number + a short label, the lowest-density surface in the app, so
    // it can afford to sit at the top of the glass hierarchy — deeper blur, slightly lower
    // opacity — without any legibility cost the way a dense table would have.
    <Card className={cn("border-border-default/70 bg-surface/85 p-5 backdrop-blur-2xl", className)}>
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">{label}</p>
        {icon && <span className="text-text-tertiary">{icon}</span>}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="font-tabular text-2xl font-semibold text-text-primary">{value}</span>
        {delta && <span className={cn("text-xs font-medium font-tabular", deltaColor)}>{delta}</span>}
      </div>
      {hint && <p className="mt-1 text-xs text-text-tertiary">{hint}</p>}
    </Card>
  );
}
