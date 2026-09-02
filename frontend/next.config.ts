import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output produces a minimal `.next/standalone` server bundle (only the
  // production dependencies actually traced from the build) — needed by frontend/Dockerfile's
  // runtime stage so the container image doesn't have to ship the full node_modules tree.
  output: "standalone",
};

export default nextConfig;
