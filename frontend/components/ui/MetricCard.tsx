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
    <Card className={cn("p-5", className)}>
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
