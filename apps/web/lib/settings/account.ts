/** What the user types to confirm account deletion (DASH-14). */
export const DELETE_CONFIRMATION = "DELETE";

/** Where Delete account sends a viewer whose session expired (#78): sign in, then come back. */
export const DELETE_SIGN_IN_PATH = `/sign-in?next=${encodeURIComponent("/settings#delete-account")}`;

/**
 * Where the browser goes after the delete request (#78). The API keeps its contract (a JSON
 * 401 for a request without a session, AUTH-03); the page turns that into sign-in. Otherwise
 * the route's own redirect is followed (to `/sign-in?deleted=1`, or back to Settings with
 * `?error=`, whose `#delete-account` fragment a fetch drops). Null: no usable answer.
 */
export function afterDeleteRequest(response: {
  status: number;
  redirected: boolean;
  url: string;
}): string | null {
  if (response.status === 401) return DELETE_SIGN_IN_PATH;
  if (!response.redirected || !response.url) return null;
  const url = new URL(response.url);
  const path = `${url.pathname}${url.search}`;
  return url.pathname === "/settings" ? `${path}#delete-account` : path;
}

const PROVIDERS: Record<string, string> = { github: "GitHub", google: "Google" };

/** "GitHub", "Google", or null when unknown. */
export function providerLabel(provider: unknown): string | null {
  return typeof provider === "string" ? (PROVIDERS[provider] ?? null) : null;
}
