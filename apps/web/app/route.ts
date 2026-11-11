/**
 * GET / — the public landing page (LAND-01, ADR-0009). Built once (static) and served with its
 * own CSP; signed-in visitors never reach it (proxy.ts redirects them to /dashboard).
 */
import { buildSiteUrl } from "@/lib/env";
import { buildLandingCsp } from "@/lib/landing/csp";
import { extensionInstallUrl, REPOSITORY_URL, siteVerificationToken } from "@/lib/landing/links";
import { renderLanding } from "@/lib/landing/page";

export const dynamic = "force-static";

export function GET() {
  const site = buildSiteUrl();
  const html = renderLanding({
    siteUrl: site,
    installUrl: extensionInstallUrl(),
    repositoryUrl: REPOSITORY_URL,
    googleSiteVerification: siteVerificationToken(),
  });
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": buildLandingCsp(site.startsWith("https://")),
    },
  });
}
