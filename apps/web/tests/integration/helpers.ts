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
 * Signs in with the same cookie format the dashboard uses. `signedInMinutesAgo` backdates the
 * sign-in recorded for the session (`amr` claim, AUTH-14) and refreshes it, like a session that
 * has been kept alive by refreshes since then.
 */
export async function dashboardSession(
  email: string,
  options: { signedInMinutesAgo?: number } = {},
) {
  const apiUrl = env("API_URL");
  const admin = createClient(apiUrl, env("SECRET_KEY"), { auth: { persistSession: false } });
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
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
  const verified = await client.auth.verifyOtp({
    token_hash: data.properties.hashed_token,
    type: "magiclink",
  });
  if (verified.error || !verified.data.session) throw verified.error ?? new Error("no session");
  let session = verified.data.session;
  if (options.signedInMinutesAgo !== undefined) {
    const ago = `now() - interval '${Math.trunc(options.signedInMinutesAgo)} minutes'`;
    sql(`update auth.mfa_amr_claims set created_at = ${ago}, updated_at = ${ago}
         where session_id = (select id from auth.sessions
                             where user_id = '${session.user.id}'
                             order by created_at desc limit 1)`);
    const refreshed = await client.auth.refreshSession();
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
