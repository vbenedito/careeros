/**
 * LAND-01, SEC-15: the static landing page runs no script of its own, so Vercel's analytics
 * beacon reports whatever URL the visitor arrived at. The proxy therefore sends a signed-out
 * visitor at `/?…` to `/` with only the `utm_*` parameters kept, so the beacon only ever sees
 * clean URLs (an OAuth fallback such as `/?code=…` or a shared link with personal data never
 * reaches analytics). Fragments never reach the server; the landing page's own are in-page
 * anchors (`#how`, `#faq`).
 */

/** The search string (with `?`, or "") to redirect to, or null when `search` is already clean. */
export function cleanLandingSearch(search: string): string | null {
  const params = new URLSearchParams(search);
  const kept = new URLSearchParams();
  let dropped = false;
  for (const [name, value] of params) {
    if (name.startsWith("utm_")) kept.append(name, value);
    else dropped = true;
  }
  if (!dropped) return null;
  const query = kept.toString();
  return query ? `?${query}` : "";
}
