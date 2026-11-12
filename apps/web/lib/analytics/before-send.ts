/**
 * SEC-15: what a page view may tell Vercel Web Analytics. Pure, so it is unit-tested and runs
 * unchanged in the browser as the `beforeSend` hook.
 *  - auth routes and the extension handoff (`/connect`) are never reported;
 *  - query strings are dropped except the dashboard period (`view`) and campaign tags (`utm_*`);
 *  - fragments are dropped.
 */

/** Paths (and everything below them) whose page views are dropped. */
export const EXCLUDED_ANALYTICS_PATHS = ["/auth", "/connect"] as const;

/** Query parameters kept on a reported URL; everything else is stripped. */
const keepParam = (name: string) => name === "view" || name.startsWith("utm_");

export function filterAnalyticsEvent<E extends { url: string }>(event: E): E | null {
  let url: URL;
  try {
    url = new URL(event.url);
  } catch {
    return null;
  }
  let path: string;
  try {
    path = decodeURIComponent(url.pathname)
      .toLowerCase()
      .replace(/\/{2,}/g, "/");
  } catch {
    return null;
  }
  const excluded = EXCLUDED_ANALYTICS_PATHS.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
  if (excluded) return null;
  const kept = new URLSearchParams();
  for (const [name, value] of url.searchParams) if (keepParam(name)) kept.append(name, value);
  const query = kept.toString();
  return { ...event, url: `${url.origin}${url.pathname}${query ? `?${query}` : ""}` };
}
