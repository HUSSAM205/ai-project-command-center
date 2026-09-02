import { cn } from "@/lib/utils";
import type { StreamStatus } from "@/lib/useDashboardStream";
import { PulseDot } from "./PulseDot";

const CONFIG: Record<StreamStatus, { label: string; dot: string; pulse: boolean }> = {
  connecting: { label: "Connecting…", dot: "bg-text-tertiary", pulse: false },
  live: { label: "Live", dot: "bg-success-solid", pulse: true },
  reconnecting: { label: "Reconnecting…", dot: "bg-warning-solid", pulse: false },
  offline: { label: "Offline", dot: "bg-critical-solid", pulse: false },
};

/**
 * Honest connection indicator for the dashboard stream — reflects real state (connected /
 * reconnecting / offline). Only the genuinely-live state gets the ambient breathing rings
 * (PulseDot); connecting/reconnecting/offline stay a static dot so the animation itself carries
 * meaning instead of being decorative "AI is thinking" motion.
 */
export function LiveIndicator({ status, className }: { status: StreamStatus; className?: string }) {
  const { label, dot, pulse } = CONFIG[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium text-text-tertiary", className)}>
      {pulse ? <PulseDot tone="success" /> : <span className={cn("h-1.5 w-1.5 rounded-full", dot)} aria-hidden="true" />}
      {label}
    </span>
  );
}
