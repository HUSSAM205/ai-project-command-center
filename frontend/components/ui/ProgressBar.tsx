import { cn } from "@/lib/utils";
import type { SemanticTone } from "./Badge";

const fillClasses: Record<SemanticTone, string> = {
  success: "bg-success-solid",
  warning: "bg-warning-solid",
  high: "bg-high-solid",
  critical: "bg-critical-solid",
  info: "bg-info-solid",
  neutral: "bg-brand-500",
};

export function ProgressBar({
  value,
  tone = "neutral",
  className,
  label,
  showValue = false,
}: {
  value: number;
  tone?: SemanticTone;
  className?: string;
  label?: string;
  showValue?: boolean;
}) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("w-full", className)}>
      {(label || showValue) && (
        <div className="flex items-center justify-between mb-1 text-xs text-text-secondary">
          {label && <span>{label}</span>}
          {showValue && <span className="font-tabular font-medium text-text-primary">{Math.round(pct)}%</span>}
        </div>
      )}
      <div
        className="h-1.5 w-full rounded-full bg-inset overflow-hidden"
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className={cn("h-full rounded-full transition-[width] duration-300", fillClasses[tone])}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
