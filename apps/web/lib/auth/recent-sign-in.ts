/**
 * AUTH-14: account deletion needs a recent sign-in. Supabase records each authentication in
 * the access token's `amr` claim with its time; refreshing the token keeps the original time,
 * so it tells how long ago the user actually signed in (unlike `iat`, which moves on refresh).
 */

/** How recent the sign-in must be, in seconds (10 minutes, product owner decision). */
export const RECENT_SIGN_IN_S = 10 * 60;

/** Tolerated clock difference between Supabase Auth and this server, in seconds. */
const CLOCK_SKEW_S = 60;

/** Latest authentication time in the claims (Unix seconds), or null when there is none. */
export function lastSignInAt(claims: { amr?: unknown } | null | undefined): number | null {
  if (!Array.isArray(claims?.amr)) return null;
  let latest: number | null = null;
  for (const entry of claims.amr) {
    const timestamp = (entry as { timestamp?: unknown } | null)?.timestamp;
    if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) continue;
    if (latest === null || timestamp > latest) latest = timestamp;
  }
  return latest;
}

export function isRecentSignIn(
  claims: { amr?: unknown } | null | undefined,
  nowMs: number,
  maxAgeS: number = RECENT_SIGN_IN_S,
): boolean {
  const at = lastSignInAt(claims);
  if (at === null) return false;
  const age = nowMs / 1000 - at;
  return age <= maxAgeS && age >= -CLOCK_SKEW_S;
}
