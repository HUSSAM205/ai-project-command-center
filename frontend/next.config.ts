import type { NextConfig } from "next";

// Origin of the real FastAPI backend. Defaults to the local dev backend; in production this
// is set to the real backend host (e.g. `https://api.example.com`) so the proxy below forwards
// there — no code change needed, just the env var.
const BACKEND_ORIGIN = process.env.BACKEND_ORIGIN ?? "http://localhost:8000";

const nextConfig: NextConfig = {
  // Standalone output produces a minimal `.next/standalone` server bundle — needed by
  // frontend/Dockerfile's runtime stage (self-hosted/docker-compose deploys), but it actively
  // breaks a `vercel deploy` build (Vercel's own build pipeline expects the default output mode
  // and errors on the standalone trace file layout: `ENOENT .next/next-server.js.nft.json`).
  // Only opt into it when frontend/Dockerfile builds (it sets DOCKER_BUILD=1) — plain `next build`
  // and Vercel builds get the default mode.
  ...(process.env.DOCKER_BUILD === "1" ? { output: "standalone" as const } : {}),

  // Proxies API calls through the frontend's own origin so the browser only ever talks to one
  // origin (zero CORS in production, and `frontend/lib/api.ts` can use a relative API_BASE_URL).
  // Note: this proxies standard request/response bodies fine; the SSE endpoint
  // (`/api/v1/dashboard/stream`) also passes through cleanly in Next.js dev/`next start` because
  // rewrites are a transparent server-side proxy of the raw response stream rather than a
  // buffering fetch — see `frontend/lib/useDashboardStream.ts`, which additionally falls back to
  // polling on its own if a given deployment target ever behaves otherwise.
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${BACKEND_ORIGIN}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
