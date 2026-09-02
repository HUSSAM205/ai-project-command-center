import { cn } from "@/lib/utils";
import type { SemanticTone } from "./Badge";
import { AnimatedNumber } from "./AnimatedNumber";

function toneFromHealth(score: number): SemanticTone {
  if (score >= 80) return "success";
  if (score >= 60) return "warning";
  if (score >= 40) return "high";
  return "critical";
}

const ringColor: Record<SemanticTone, string> = {
  success: "var(--success-solid)",
  warning: "var(--warning-solid)",
  high: "var(--high-solid)",
  critical: "var(--critical-solid)",
  info: "var(--info-solid)",
  neutral: "var(--brand-500)",
};

const textColor: Record<SemanticTone, string> = {
  success: "text-success-fg",
  warning: "text-warning-fg",
  high: "text-high-fg",
  critical: "text-critical-fg",
  info: "text-info-fg",
  neutral: "text-text-primary",
};

/** Circular health-score gauge (0-100). */
export function HealthGauge({ score, size = 56 }: { score: number; size?: number }) {
  const tone = toneFromHealth(score);
  const radius = (size - 6) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.max(0, Math.min(100, score)) / 100);

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} stroke="var(--border-default)" strokeWidth={5} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={ringColor[tone]}
          strokeWidth={5}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 400ms ease" }}
        />
      </svg>
      <AnimatedNumber
        value={Math.max(0, Math.min(100, score))}
        format={(n) => Math.round(n).toString()}
        className={cn("absolute text-sm font-semibold", textColor[tone])}
      />
    </div>
  );
}

/** Small colored dot + label, for compact status rows. */
export function StatusDot({ tone = "neutral", label }: { tone?: SemanticTone; label?: string }) {
  const dotBg: Record<SemanticTone, string> = {
    success: "bg-success-solid",
    warning: "bg-warning-solid",
    high: "bg-high-solid",
    critical: "bg-critical-solid",
    info: "bg-info-solid",
    neutral: "bg-text-tertiary",
  };
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-text-secondary">
      <span className={cn("h-2 w-2 rounded-full shrink-0", dotBg[tone])} aria-hidden="true" />
      {label}
    </span>
  );
}

export { toneFromHealth };
