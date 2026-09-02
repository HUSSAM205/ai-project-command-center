import { useEffect, useState } from "react";

/**
 * Returns true once `active` has stayed true for longer than `delayMs`. Used to turn a bare
 * spinner into "still working, here's why" once a wait crosses from "normal" into "worth
 * explaining" — specifically for the Render free-tier cold start documented in
 * docs/DEPLOYMENT_HANDOVER.md's Housekeeping section: the backend can take up to ~45s to wake
 * from idle, and GET requests already retry through the fast-502 case (lib/api.ts), but when
 * Render instead holds the connection open while the container boots, the caller just waits —
 * with no explanation, that reads as "stuck" rather than "warming up".
 */
export function useSlowLoadHint(active: boolean, delayMs = 4000): boolean {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!active) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resets the hint the moment loading stops, not a cascading update
      setSlow(false);
      return;
    }
    const timer = setTimeout(() => setSlow(true), delayMs);
    return () => clearTimeout(timer);
  }, [active, delayMs]);

  return slow;
}
