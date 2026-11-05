/**
 * Dashboard auth against the real local Supabase stack (AUTH-01..04, SEC-08/09).
 * OAuth providers cannot run in CI, so the user is created like a GitHub OAuth user and the
 * session is obtained with an admin single-use token (the mechanism validated in spike 0003).
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

const env = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`missing env ${name}`);
  return value;
};
const BASE_URL = env("BASE_URL");
const API_URL = env("API_URL");
const PUBLISHABLE_KEY = env("PUBLISHABLE_KEY");
const SECRET_KEY = env("SECRET_KEY");
const DB_CONTAINER = env("DB_CONTAINER");

const sql = (query: string) =>
  execFileSync(
    "docker",
    ["exec", "-i", DB_CONTAINER, "psql", "-U", "postgres", "-At", "-c", query],
    {
      encoding: "utf8",
    },
  );

function createOAuthUser(email: string): string {
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

/** Signs in with the same cookie format the dashboard uses and returns a Cookie header. */
async function sessionCookies(email: string) {
  const admin = createClient(API_URL, SECRET_KEY, { auth: { persistSession: false } });
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw error;

  const jar = new Map<string, string>();
  const client = createServerClient(API_URL, PUBLISHABLE_KEY, {
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
  return {
    header: [...jar].map(([name, value]) => `${name}=${value}`).join("; "),
    refreshToken: verified.data.session.refresh_token,
  };
}

const get = (path: string, cookie?: string) =>
  fetch(`${BASE_URL}${path}`, { redirect: "manual", headers: cookie ? { cookie } : {} });

describe("dashboard auth (integration)", () => {
  const email = `int-${Date.now()}@example.test`;
  let cookie = "";
  let refreshToken = "";

  beforeAll(async () => {
    createOAuthUser(email);
    ({ header: cookie, refreshToken } = await sessionCookies(email));
  });

  it("AUTH-03 signed out: pages redirect to /sign-in with next, API answers 401", async () => {
    const page = await get("/settings?tab=sites");
    expect(page.status).toBe(307);
    expect(page.headers.get("location")).toBe(`${BASE_URL}/sign-in?next=%2Fsettings%3Ftab%3Dsites`);

    const api = await get("/api/extension/link");
    expect(api.status).toBe(401);
    expect(await api.json()).toEqual({ error: "NOT_AUTHENTICATED" });
  });

  it("AUTH-02 signed in: the dashboard renders the user from verified claims", async () => {
    const res = await get("/", cookie);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain(email);
  });

  it("AUTH-03 signed in: /sign-in redirects home and API routes are no longer 401", async () => {
    const signIn = await get("/sign-in", cookie);
    expect(signIn.status).toBe(307);
    expect(signIn.headers.get("location")).toBe(`${BASE_URL}/`);
    expect((await get("/api/does-not-exist", cookie)).status).toBe(404);
  });

  it("SEC-09 pages carry a nonce CSP and the static security headers", async () => {
    const res = await get("/sign-in");
    const csp = res.headers.get("content-security-policy") ?? "";
    const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
    expect(nonce).toBeTruthy();
    expect(csp).toContain(`connect-src 'self' ${new URL(API_URL).origin}`);
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    const html = await res.text();
    const scripts = html.match(/<script\b[^>]*>/g) ?? [];
    expect(scripts.length).toBeGreaterThan(0);
    for (const tag of scripts) expect(tag).toContain(`nonce="${nonce}"`);
  });

  it("AUTH-01 sign-in starts PKCE OAuth with the provider and a safe next path", async () => {
    const res = await fetch(`${BASE_URL}/auth/sign-in`, {
      method: "POST",
      redirect: "manual",
      headers: { origin: BASE_URL, "content-type": "application/x-www-form-urlencoded" },
      body: "provider=github&next=https://evil.example",
    });
    expect(res.status).toBe(303);
    const location = new URL(res.headers.get("location") ?? "");
    expect(location.origin).toBe(new URL(API_URL).origin);
    expect(location.pathname).toBe("/auth/v1/authorize");
    expect(location.searchParams.get("provider")).toBe("github");
    expect(location.searchParams.get("code_challenge")).toBeTruthy();
    expect(location.searchParams.get("scopes")).toBe("user:email");
    expect(location.searchParams.get("redirect_to")).toBe(`${BASE_URL}/auth/callback?next=%2F`);
  });

  it("SEC-08 state-changing routes reject foreign origins", async () => {
    for (const path of ["/auth/sign-in", "/auth/sign-out"]) {
      const res = await fetch(`${BASE_URL}${path}`, {
        method: "POST",
        redirect: "manual",
        headers: { cookie, origin: "https://evil.example" },
      });
      expect(res.status, path).toBe(403);
    }
  });

  it("AUTH-04 sign-out clears the cookies and revokes the dashboard session", async () => {
    const res = await fetch(`${BASE_URL}/auth/sign-out`, {
      method: "POST",
      redirect: "manual",
      headers: { cookie, origin: BASE_URL },
    });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`${BASE_URL}/sign-in`);
    const cleared = res.headers.getSetCookie().filter((c) => c.includes("auth-token"));
    expect(cleared.length).toBeGreaterThan(0);
    for (const c of cleared) expect(c).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/i);

    const client = createClient(API_URL, PUBLISHABLE_KEY, { auth: { persistSession: false } });
    const refreshed = await client.auth.refreshSession({ refresh_token: refreshToken });
    expect(refreshed.error).not.toBeNull();
  });
});
