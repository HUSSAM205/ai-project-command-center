import { NextResponse } from "next/server";
import type { NextFetchEvent, NextRequest } from "next/server";

// Same backend origin next.config.ts's rewrite proxy uses -- see that file for why the app talks
// to the backend through a same-origin rewrite rather than calling this origin from the browser.
// This file runs server-side (Vercel Edge), so it hits the backend directly.
const BACKEND_ORIGIN = process.env.BACKEND_ORIGIN ?? "http://localhost:8000";

// Best-effort pre-warm only: fires once per matched navigation (see `matcher`), racing the
// backend's Render cold start against this request's own render/hydrate time. `waitUntil` lets the
// fetch keep running after the response is sent, so it never adds latency to the actual page load,
// and its failure is invisible to the visitor either way. This is a supplement to, not a
// replacement for, the always-on GitHub Actions cron (.github/workflows/backend-keepalive.yml) and
// the client-side heartbeat (components/BackendWarmer.tsx), which are what keep the backend warm
// between visits -- this only helps the specific request that happens to land mid cold-start.
export function proxy(_request: NextRequest, event: NextFetchEvent) {
  event.waitUntil(fetch(`${BACKEND_ORIGIN}/health`, { cache: "no-store" }).catch(() => {}));
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
