/**
 * POST /api/extension/link against the real local Supabase stack (AUTH-08/09, SEC-08).
 */
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { createOAuthUser, dashboardSession, env, sql } from "./helpers";

const DASHBOARD_URL = env("DASHBOARD_URL");
const API_URL = env("API_URL");
const PUBLISHABLE_KEY = env("PUBLISHABLE_KEY");

const link = (cookie?: string, origin: string | null = DASHBOARD_URL) =>
  fetch(`${DASHBOARD_URL}/api/extension/link`, {
    method: "POST",
    redirect: "manual",
    headers: { ...(cookie ? { cookie } : {}), ...(origin ? { origin } : {}) },
  });

async function signedInUser(label: string) {
  const email = `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
  const id = createOAuthUser(email);
  return { id, email, cookie: (await dashboardSession(email)).header };
}

describe("POST /api/extension/link (integration)", () => {
  it("AUTH-08 AUTH-09 returns only a single-use token hash, never cached", async () => {
    const { id, email, cookie } = await signedInUser("link");
    const res = await link(cookie);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(Object.keys(body)).toEqual(["tokenHash"]);
    expect(body.tokenHash).toMatch(/^[0-9a-f]{56}$/);

    // The token creates a new, independent session for the same user — exactly once.
    const client = () =>
      createClient(API_URL, PUBLISHABLE_KEY, { auth: { persistSession: false } });
    const first = await client().auth.verifyOtp({ token_hash: body.tokenHash, type: "magiclink" });
    expect(first.error).toBeNull();
    expect(first.data.user?.id).toBe(id);
    expect(first.data.user?.email).toBe(email);
    const replay = await client().auth.verifyOtp({ token_hash: body.tokenHash, type: "magiclink" });
    expect(replay.error).not.toBeNull();
  });

  it("SEC-08 a foreign or missing Origin is refused", async () => {
    const { cookie } = await signedInUser("origin");
    const foreign = await link(cookie, "https://evil.example");
    expect(foreign.status).toBe(403);
    expect(await foreign.json()).toEqual({ error: "FORBIDDEN" });
    expect((await link(cookie, null)).status).toBe(403);
  });

  it("AUTH-08 without a session the request is rejected", async () => {
    const res = await link();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "NOT_AUTHENTICATED" });
  });

  it("AUTH-12a a revoked session cannot mint a token, even with a still-valid access token", async () => {
    const { id, cookie } = await signedInUser("revoked");
    expect((await link(cookie)).status).toBe(200);
    // "Sign out of all devices": every session of the user is gone; the JWT in the cookie is not
    // expired yet, but the endpoint asks Supabase Auth whether its session still exists.
    sql(`delete from auth.sessions where user_id = '${id}'`);
    expect((await link(cookie)).status).toBe(401);
  });

  it("AUTH-08 the 6th request in a minute is rate limited", async () => {
    const { cookie } = await signedInUser("rate");
    for (let i = 0; i < 5; i++) expect((await link(cookie)).status).toBe(200);
    const sixth = await link(cookie);
    expect(sixth.status).toBe(429);
    expect(await sixth.json()).toEqual({ error: "RATE_LIMITED" });
  });

  it("only POST is accepted", async () => {
    const { cookie } = await signedInUser("method");
    const res = await fetch(`${DASHBOARD_URL}/api/extension/link`, { headers: { cookie } });
    expect(res.status).toBe(405);
  });
});
