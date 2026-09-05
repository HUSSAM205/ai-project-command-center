"use client";

import { useEffect } from "react";
import { API_BASE_URL } from "@/lib/api";

// Render's free tier spins the backend down after ~15 minutes idle. The GitHub Actions cron in
// .github/workflows/backend-keepalive.yml keeps it warm around the clock; this covers the gap for
// whoever actually has the site open right now, independent of that cron's own 10-minute cadence.
// Mounted once in the root layout (not the authed app layout) so it runs on every route, including
// the public marketing pages and login/register -- a recruiter landing on "/" for the first time
// benefits from this exactly as much as a signed-in user on the dashboard. Fire-and-forget: a
// failed or slow ping here must never surface to the visitor, so no state, no retry, no thrown
// error -- `useDashboardStream`'s own polling/backoff is what actually handles a real outage.
const HEARTBEAT_INTERVAL_MS = 7 * 60 * 1000;

export function BackendWarmer() {
  useEffect(() => {
    const ping = () => {
      fetch(`${API_BASE_URL}/health`, { cache: "no-store", keepalive: true }).catch(() => {});
    };
    ping();
    const id = setInterval(ping, HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  return null;
}
