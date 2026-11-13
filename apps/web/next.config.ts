import type { NextConfig } from "next";
import { assertProductionEnv } from "./lib/env-check";
import { HSTS_HEADER, STATIC_SECURITY_HEADERS } from "./lib/security/headers";

// ENV-05b, SEC-13: a production build fails on missing or wrong settings instead of silently
// falling back to localhost, the Vercel domain or the store search. Other builds are unaffected.
if (process.env.VERCEL_ENV === "production") assertProductionEnv(process.env);

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
