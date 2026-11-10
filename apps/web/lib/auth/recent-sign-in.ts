/**
 * AUTH-14: account deletion needs a recent sign-in. Supabase records each authentication in
 * the access token's `amr` claim with its time; refreshing the token keeps the original time,
 * so it tells how long ago the user actually signed in (unlike `iat`, which moves on refresh).
 *
 * Only an OAuth sign-in counts. A session can collect other fresh entries without the person
 * signing in again: an MFA factor it enrolls itself (`totp`, `phone`, `webauthn`), or the
 * single-use token from /api/extension/link redeemed with verifyOtp (`otp`). Any of those in the
 * hands of someone holding a stolen session would defeat the check (security review of #114).
 */

/** How recent the sign-in must be, in seconds (10 minutes, product owner decision). */
export const RECENT_SIGN_IN_S = 10 * 60;

/** Tolerated clock difference between Supabase Auth and this server, in seconds. */
const CLOCK_SKEW_S = 60;

/** The `amr` methods that prove the person signed in with Google or GitHub. */
export const SIGN_IN_METHODS: readonly string[] = ["oauth"];

/** Latest OAuth sign-in time in the claims (Unix seconds), or null when there is none. */
export function lastSignInAt(claims: { amr?: unknown } | null | undefined): number | null {
  if (!Array.isArray(claims?.amr)) return null;
  let latest: number | null = null;
  for (const entry of claims.amr) {
    const { method, timestamp } = (entry ?? {}) as { method?: unknown; timestamp?: unknown };
    if (typeof method !== "string" || !SIGN_IN_METHODS.includes(method)) continue;
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
