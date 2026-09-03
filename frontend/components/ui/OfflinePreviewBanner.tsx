import { WifiOff } from "lucide-react";

/** Shown whenever a page has fallen back to lib/offlinePreview.ts's illustrative data — never
 * silent, so a visitor (or the org's own team) can never mistake fabricated numbers for real
 * production data. Deliberately a small, quiet inline note rather than a full-width colored
 * alert box: what it's disclosing is "this is a preview, not live figures" — an ambient system
 * state, not an incident that needs the reader's attention grabbed. Muted/neutral tone throughout
 * (no warning-amber) for the same reason. Same treatment everywhere it appears so it reads as one
 * consistent, calm signal rather than a one-off error. */
export function OfflinePreviewBanner({ onRetry, subject = "data" }: { onRetry: () => void; subject?: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-text-tertiary">
      <WifiOff className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span>
        Preview data — illustrative {subject}, not your organization&apos;s live figures.
      </span>
      <button type="button" onClick={onRetry} className="font-medium text-text-secondary underline underline-offset-2 hover:text-text-primary">
        Retry
      </button>
    </div>
  );
}
