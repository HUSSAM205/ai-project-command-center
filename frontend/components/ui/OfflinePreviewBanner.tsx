import { WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";

/** Shown whenever a page has fallen back to lib/offlinePreview.ts's illustrative data — never
 * silent, so a visitor (or the org's own team) can never mistake fabricated numbers for real
 * production data. Deliberately a small, quiet note rather than a full-width colored alert box:
 * what it's disclosing is "this is a preview, not live figures" — an ambient system state, not
 * an incident that needs the reader's attention grabbed. Muted/neutral tone throughout (no
 * warning-amber), and faded to 60% opacity on top of that, for the same reason. Same treatment
 * everywhere it appears so it reads as one consistent, calm signal rather than a one-off error.
 *
 * `inline`: renders as a compact pill meant to sit directly beside a page's title/status row
 * (see app/app/dashboard/page.tsx) instead of on its own line below the header — use where the
 * page already has a header row with room for it. */
export function OfflinePreviewBanner({
  onRetry,
  subject = "data",
  inline = false,
  className,
}: {
  onRetry: () => void;
  subject?: string;
  inline?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 text-xs text-text-tertiary opacity-60 transition-opacity hover:opacity-100",
        inline ? "shrink-0" : "flex-wrap",
        className,
      )}
    >
      <WifiOff className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span>{inline ? "Preview data" : `Preview data — illustrative ${subject}, not your organization's live figures.`}</span>
      <button type="button" onClick={onRetry} className="font-medium text-text-secondary underline underline-offset-2 hover:text-text-primary">
        Retry
      </button>
    </div>
  );
}
