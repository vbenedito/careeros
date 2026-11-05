import type { NextConfig } from "next";
import { HSTS_HEADER, STATIC_SECURITY_HEADERS } from "./lib/security/headers";

const nextConfig: NextConfig = {
  // @careeros/shared is consumed as TypeScript source (ADR-0001).
  transpilePackages: ["@careeros/shared"],
  poweredByHeader: false,
  // SEC-09: static headers on every response (the CSP with its nonce is set in proxy.ts).
  async headers() {
    const isProd =
      process.env.NODE_ENV === "production" && process.env.SITE_URL?.startsWith("https://");
    return [
      {
        source: "/:path*",
        headers: [...STATIC_SECURITY_HEADERS, ...(isProd ? [HSTS_HEADER] : [])],
      },
    ];
  },
};

export default nextConfig;
