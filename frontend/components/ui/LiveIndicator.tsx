import { cn } from "@/lib/utils";
import type { StreamStatus } from "@/lib/useDashboardStream";

const CONFIG: Record<StreamStatus, { label: string; dot: string }> = {
  connecting: { label: "Connecting…", dot: "bg-text-tertiary" },
  live: { label: "Live", dot: "bg-success-solid" },
  reconnecting: { label: "Reconnecting…", dot: "bg-warning-solid" },
  offline: { label: "Offline", dot: "bg-critical-solid" },
};

/**
 * Honest connection indicator for the dashboard stream — a static dot reflecting real state
 * (connected / reconnecting / offline), not a decorative "AI is thinking" pulse.
 */
export function LiveIndicator({ status, className }: { status: StreamStatus; className?: string }) {
  const { label, dot } = CONFIG[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium text-text-tertiary", className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", dot)} aria-hidden="true" />
      {label}
    </span>
  );
}
