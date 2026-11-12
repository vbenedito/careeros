"use client";

/**
 * Vercel Web Analytics on app pages (SEC-15, ADR-0010). Rendered by the root layout only when
 * `isAnalyticsEnabled()`; every page view goes through `filterAnalyticsEvent` first. The package
 * inserts `/_vercel/insights/script.js` from this nonce'd bundle, which the CSP's
 * 'strict-dynamic' allows (SEC-09).
 *
 * Not rendered on `/connect`, `/settings` and `/auth/*` (the pages that mint extension sessions,
 * delete accounts and handle sign-in codes): the script is not loaded when one of them is the
 * first page, and the component is unmounted when the viewer navigates to one. Every in-app link to them is a plain `<a>` (a full
 * document load, guarded by `lib/analytics/full-navigation.test.ts`), so a script loaded on an
 * earlier page never survives into them.
 */
import { Analytics } from "@vercel/analytics/next";
import { usePathname } from "next/navigation";
import { filterAnalyticsEvent, isAnalyticsExcludedPath } from "@/lib/analytics/before-send";

export function WebAnalytics() {
  const pathname = usePathname();
  if (pathname === null || isAnalyticsExcludedPath(pathname)) return null;
  return <Analytics beforeSend={filterAnalyticsEvent} />;
}
