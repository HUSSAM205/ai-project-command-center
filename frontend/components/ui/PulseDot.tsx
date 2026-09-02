import { cn } from "@/lib/utils";

const dotBg: Record<string, string> = {
  success: "bg-success-solid",
  warning: "bg-warning-solid",
  high: "bg-high-solid",
  critical: "bg-critical-solid",
  info: "bg-info-solid",
  neutral: "bg-text-tertiary",
};

/**
 * Ambient dual-ring "breathing" indicator — a restrained opacity/scale pulse on two staggered
 * rings behind a solid dot, for genuinely live/streaming state (the dashboard's "Live" stream,
 * a healthy AI provider in the telemetry drawer). Pure CSS (`.pulse-ring` in globals.css) so it
 * costs nothing beyond paint, and is disabled outright under `prefers-reduced-motion: reduce`.
 * Not a glow effect — no blur, no color bleed, just scale + opacity on a 1.5px ring.
 */
export function PulseDot({ tone = "success", className }: { tone?: keyof typeof dotBg; className?: string }) {
  const bg = dotBg[tone] ?? dotBg.neutral;
  return (
    <span className={cn("relative inline-flex h-1.5 w-1.5 shrink-0", className)} aria-hidden="true">
      <span className={cn("pulse-ring absolute inset-0 rounded-full", bg)} />
      <span className={cn("pulse-ring absolute inset-0 rounded-full [animation-delay:0.9s]", bg)} />
      <span className={cn("relative inline-flex h-1.5 w-1.5 rounded-full", bg)} />
    </span>
  );
}
