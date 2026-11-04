import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @careeros/shared is consumed as TypeScript source (ADR-0001).
  transpilePackages: ["@careeros/shared"],
  poweredByHeader: false,
};

export default nextConfig;
