"use client";

/**
 * Vercel Web Analytics on app pages (SEC-15, ADR-0010). Rendered by the root layout only when
 * `isAnalyticsEnabled()`; every page view goes through `filterAnalyticsEvent` first. The package
 * inserts `/_vercel/insights/script.js` from this nonce'd bundle, which the CSP's
 * 'strict-dynamic' allows (SEC-09).
 */
import { Analytics } from "@vercel/analytics/next";
import { filterAnalyticsEvent } from "@/lib/analytics/before-send";

export function WebAnalytics() {
  return <Analytics beforeSend={filterAnalyticsEvent} />;
}
