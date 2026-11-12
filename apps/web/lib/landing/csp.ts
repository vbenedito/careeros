/**
 * The landing page's own security policy (LAND-06, ADR-0009): no inline script runs at all; the
 * one inline <style> is allowed by its hash. Style attributes cannot run code (as in SEC-09).
 * With Web Analytics on (SEC-15, ADR-0010) exactly one external script is allowed, by its full
 * URL on the site origin, and it may send page views to the insights endpoint only.
 */
import { createHash } from "node:crypto";
import { ANALYTICS_ENDPOINT_PATH, ANALYTICS_SCRIPT_PATH } from "@/lib/analytics/config";
import { LANDING_CSS } from "./page";

export const LANDING_STYLE_HASH = `sha256-${createHash("sha256").update(LANDING_CSS).digest("base64")}`;

/**
 * @param analyticsOrigin the site origin when Web Analytics is on; omitted, no script may run.
 */
export function buildLandingCsp(
  upgradeInsecureRequests: boolean,
  analyticsOrigin?: string | undefined,
): string {
  const origin = analyticsOrigin ? new URL(analyticsOrigin).origin : undefined;
  const directives = [
    "default-src 'none'",
    origin ? `script-src ${origin}${ANALYTICS_SCRIPT_PATH}` : "script-src 'none'",
    ...(origin ? [`connect-src ${origin}${ANALYTICS_ENDPOINT_PATH}`] : []),
    `style-src '${LANDING_STYLE_HASH}'`,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ];
  if (upgradeInsecureRequests) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}
