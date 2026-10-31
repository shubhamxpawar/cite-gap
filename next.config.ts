import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit .next/standalone so the Docker image only ships the traced server
  // bundle (see deploy/synteq.md). `next start` still works locally.
  output: "standalone",
};

export default nextConfig;
