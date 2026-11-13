/**
 * SEC-15: what a page view may tell Vercel Web Analytics. Pure, so it is unit-tested and runs
 * unchanged in the browser as the `beforeSend` hook.
 *  - auth routes, the extension handoff (`/connect`) and Settings are never reported (the
 *    script is not even rendered there, `components/app/web-analytics.tsx`);
 *  - query strings are dropped except the dashboard period (`view`) and campaign tags (`utm_*`);
 *  - fragments are dropped.
 */

/** Paths (and everything below them) whose page views are dropped. */
export const EXCLUDED_ANALYTICS_PATHS = ["/auth", "/connect", "/settings"] as const;

/** Normalizes a path the way the filter does (decoded, lowercase, repeated slashes collapsed). */
function normalizePath(pathname: string): string | null {
  try {
    return decodeURIComponent(pathname)
      .toLowerCase()
      .replace(/\/{2,}/g, "/");
  } catch {
    return null;
  }
}

/** True for a path whose page views are never reported; undecodable paths count as excluded. */
export function isAnalyticsExcludedPath(pathname: string): boolean {
  const path = normalizePath(pathname);
  if (path === null) return true;
  return EXCLUDED_ANALYTICS_PATHS.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

/** Query parameters kept on a reported URL; everything else is stripped. */
const keepParam = (name: string) => name === "view" || name.startsWith("utm_");

export function filterAnalyticsEvent<E extends { url: string }>(event: E): E | null {
  let url: URL;
  try {
    url = new URL(event.url);
  } catch {
    return null;
  }
  if (isAnalyticsExcludedPath(url.pathname)) return null;
  const kept = new URLSearchParams();
  for (const [name, value] of url.searchParams) if (keepParam(name)) kept.append(name, value);
  const query = kept.toString();
  return { ...event, url: `${url.origin}${url.pathname}${query ? `?${query}` : ""}` };
}
