/**
 * Helpers for integration tests against the local Supabase stack and a running dashboard.
 * Also imported by the extension's real-Chromium tests (same users, same cookie format).
 * OAuth providers cannot run in CI, so users are created like GitHub OAuth users and sessions
 * are obtained with an admin single-use token (the mechanism validated in spike 0003).
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

export const env = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`missing env ${name}`);
  return value;
};

/** Runs SQL as postgres inside the local database container. */
export const sql = (query: string) =>
  execFileSync(
    "docker",
    ["exec", "-i", env("DB_CONTAINER"), "psql", "-U", "postgres", "-At", "-c", query],
    { encoding: "utf8" },
  ).trim();

/** Creates a user the way GitHub OAuth would (no password, confirmed email). Returns the id. */
export function createOAuthUser(email: string): string {
  const id = randomUUID();
  sql(`insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at,
         raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token,
         recovery_token, email_change_token_new, email_change, email_change_token_current,
         phone_change, phone_change_token, reauthentication_token)
       values ('00000000-0000-0000-0000-000000000000', '${id}', 'authenticated', 'authenticated',
         '${email}', now(), '{"provider":"github","providers":["github"]}', '{}', now(), now(),
         '', '', '', '', '', '', '', '');
       insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at,
         updated_at, last_sign_in_at)
       values (gen_random_uuid(), '${id}', '${id}', 'github', '{"sub":"${id}","email":"${email}"}',
         now(), now(), now());`);
  return id;
}

/**
 * Signs in with the same cookie format the dashboard uses. The session comes from a single-use
 * token, so its `amr` claim says `otp`. For AUTH-14, `oauth: true` records it as the OAuth
 * sign-in it stands for, and `signedInMinutesAgo` moves that sign-in back in time; either one
 * then refreshes the session, like one kept alive by refreshes since.
 */
export async function dashboardSession(
  email: string,
  options: { oauth?: boolean; signedInMinutesAgo?: number } = {},
) {
  const apiUrl = env("API_URL");
  const admin = createClient(apiUrl, env("SECRET_KEY"), { auth: { persistSession: false } });
  const { data, error } = await retryOn429(() =>
    admin.auth.admin.generateLink({ type: "magiclink", email }),
  );
  if (error) throw error;

  const jar = new Map<string, string>();
  const client = createServerClient(apiUrl, env("PUBLISHABLE_KEY"), {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (cookies) => {
        for (const { name, value } of cookies) jar.set(name, value);
      },
    },
  });
  // A token is consumed only by a successful verify, so a rate-limited one can be retried.
  const verified = await retryOn429(() =>
    client.auth.verifyOtp({ token_hash: data.properties.hashed_token, type: "magiclink" }),
  );
  if (verified.error || !verified.data.session) throw verified.error ?? new Error("no session");
  let session = verified.data.session;
  if (options.oauth || options.signedInMinutesAgo !== undefined) {
    // This token's own session; `amr` timestamps come from mfa_amr_claims.updated_at.
    const sessionId = jwtPayload(session.access_token).session_id;
    const changes = [
      ...(options.oauth ? ["authentication_method = 'oauth'"] : []),
      ...(options.signedInMinutesAgo !== undefined
        ? [`updated_at = now() - interval '${Math.trunc(options.signedInMinutesAgo)} minutes'`]
        : []),
    ];
    sql(`update auth.mfa_amr_claims set ${changes.join(", ")} where session_id = '${sessionId}'`);
    // The token is passed explicitly: supabase-js drops its stored session on a 429.
    const refreshToken = session.refresh_token;
    const refreshed = await retryOn429(() =>
      client.auth.refreshSession({ refresh_token: refreshToken }),
    );
    if (refreshed.error || !refreshed.data.session)
      throw refreshed.error ?? new Error("no session");
    session = refreshed.data.session;
  }
  return {
    cookies: [...jar].map(([name, value]) => ({ name, value })),
    header: [...jar].map(([name, value]) => `${name}=${value}`).join("; "),
    refreshToken: session.refresh_token,
  };
}

/** Claims of a JWT (no verification: test helper reading a token it just received). */
function jwtPayload(token: string): { session_id: string; amr?: unknown } {
  const part = token.split(".")[1] ?? "";
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
}

/**
 * #82: retries an auth call the local stack rate-limited (HTTP 429, "slow down") with backoff.
 * The suites sign in many users from one IP within minutes; the local limits are raised in
 * supabase/config.toml, and this keeps a burst from failing a run anyway. Test helpers only:
 * the product's own 429 handling is AUTH-11.
 */
export async function retryOn429<T extends { error: { status?: number | undefined } | null }>(
  call: () => Promise<T>,
  delaysMs: readonly number[] = [1_000, 2_000, 4_000, 8_000],
): Promise<T> {
  let result = await call();
  for (const delay of delaysMs) {
    if (result.error?.status !== 429) break;
    await new Promise((r) => setTimeout(r, delay));
    result = await call();
  }
  return result;
}

/** Default margin of {@link clearOfMidnight}: longer than the journeys that read "today". */
export const MIDNIGHT_MARGIN_MS = 3 * 60_000;

/**
 * #82: a test that seeds "today", "this week" or "this month" and then reads it back from the
 * dashboard (server-rendered, so a browser clock cannot be frozen) or the popup fails if the run
 * crosses a day boundary in between. When the next UTC or local midnight is less than `marginMs`
 * away, this waits until just after it; every week and month starts at a UTC midnight (the E2E
 * contexts use UTC), so one check covers all three. Call it before seeding; give the hook or
 * test `marginMs` more timeout.
 */
export async function clearOfMidnight(marginMs = MIDNIGHT_MARGIN_MS): Promise<void> {
  const now = Date.now();
  const utc = new Date(now);
  utc.setUTCHours(24, 0, 0, 0);
  const local = new Date(now);
  local.setHours(24, 0, 0, 0);
  const wait = Math.min(utc.getTime(), local.getTime()) - now;
  if (wait < marginMs) await new Promise((r) => setTimeout(r, wait + 1_000));
}
