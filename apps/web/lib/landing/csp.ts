/**
 * The landing page's own security policy (LAND-06, ADR-0009): no script runs at all; the one
 * inline <style> is allowed by its hash. Style attributes cannot run code (as in SEC-09).
 */
import { createHash } from "node:crypto";
import { LANDING_CSS } from "./page";

export const LANDING_STYLE_HASH = `sha256-${createHash("sha256").update(LANDING_CSS).digest("base64")}`;

export function buildLandingCsp(upgradeInsecureRequests: boolean): string {
  const directives = [
    "default-src 'none'",
    "script-src 'none'",
    `style-src '${LANDING_STYLE_HASH}'`,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data:",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ];
  if (upgradeInsecureRequests) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}
