import { WifiOff } from "lucide-react";

/** Shown whenever a page has fallen back to lib/offlinePreview.ts's illustrative data — never
 * silent, so a visitor (or the org's own team) can never mistake fabricated numbers for real
 * production data. Same visual treatment everywhere it appears (PMO, Consulting, and the core
 * list pages) so it reads as one consistent system state, not a one-off error box. */
export function OfflinePreviewBanner({ onRetry, subject = "data" }: { onRetry: () => void; subject?: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-warning-border bg-warning-bg px-3.5 py-2.5 text-sm text-warning-fg">
      <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>
        Live backend unreachable — showing an offline preview with illustrative {subject}, not your organization&apos;s real
        figures.
      </span>
      <button type="button" onClick={onRetry} className="ml-auto shrink-0 font-medium underline underline-offset-2">
        Retry
      </button>
    </div>
  );
}
