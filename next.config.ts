import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit .next/standalone so the Docker image only ships the traced server
  // bundle (see deploy/synteq.md). `next start` still works locally.
  output: "standalone",
  experimental: {
    // Client router cache: dynamic pages remain valid for 30 s, so tab hops and
    // back-navigation are instant instead of refetching the RSC payload blindly.
    staleTimes: { dynamic: 30, static: 300 },
  },
};

export default nextConfig;
