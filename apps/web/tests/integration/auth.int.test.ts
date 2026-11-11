/**
 * Dashboard auth against the real local Supabase stack (AUTH-01..04, SEC-08/09).
 * Users and sessions come from ./helpers (OAuth providers cannot run in CI).
 */
import { createClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import { createOAuthUser, dashboardSession, env } from "./helpers";

// Note: not BASE_URL — Vitest sets process.env.BASE_URL itself.
const DASHBOARD_URL = env("DASHBOARD_URL");
const API_URL = env("API_URL");
const PUBLISHABLE_KEY = env("PUBLISHABLE_KEY");

/** Location headers may be relative (valid HTTP): resolve them before comparing. */
const location = (res: Response) =>
  new URL(res.headers.get("location") ?? "", DASHBOARD_URL).toString();

const get = (path: string, cookie?: string) =>
  fetch(`${DASHBOARD_URL}${path}`, { redirect: "manual", headers: cookie ? { cookie } : {} });

describe("dashboard auth (integration)", () => {
  const email = `int-${Date.now()}@example.test`;
  let cookie = "";
  let refreshToken = "";

  beforeAll(async () => {
    createOAuthUser(email);
    ({ header: cookie, refreshToken } = await dashboardSession(email));
  });

  it("AUTH-03 signed out: pages redirect to /sign-in with next, API answers 401", async () => {
    const page = await get("/settings?tab=sites");
    expect(page.status).toBe(307);
    expect(location(page)).toBe(`${DASHBOARD_URL}/sign-in?next=%2Fsettings%3Ftab%3Dsites`);

    const api = await get("/api/extension/link");
    expect(api.status).toBe(401);
    expect(await api.json()).toEqual({ error: "NOT_AUTHENTICATED" });
  });

  it("AUTH-02 signed in: the dashboard renders the user from verified claims", async () => {
    const res = await get("/dashboard", cookie);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain(email);
  });

  it("AUTH-03 signed in: /sign-in redirects home and API routes are no longer 401", async () => {
    const signIn = await get("/sign-in", cookie);
    expect(signIn.status).toBe(307);
    expect(location(signIn)).toBe(`${DASHBOARD_URL}/dashboard`);
    expect((await get("/api/does-not-exist", cookie)).status).toBe(404);
  });

  it("SEC-09 pages carry a nonce CSP and the static security headers", async () => {
    const res = await get("/sign-in");
    const csp = res.headers.get("content-security-policy") ?? "";
    const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
    expect(nonce).toBeTruthy();
    expect(csp).toContain("connect-src 'self';");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("cross-origin-opener-policy")).toBe("same-origin");
    expect(res.headers.get("cross-origin-resource-policy")).toBe("same-origin");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    const html = await res.text();
    const scripts = html.match(/<script\b[^>]*>/g) ?? [];
    expect(scripts.length).toBeGreaterThan(0);
    for (const tag of scripts) expect(tag).toContain(`nonce="${nonce}"`);
  });

  it("AUTH-01 sign-in starts PKCE OAuth with the provider and a safe next path", async () => {
    const res = await fetch(`${DASHBOARD_URL}/auth/sign-in`, {
      method: "POST",
      redirect: "manual",
      headers: { origin: DASHBOARD_URL, "content-type": "application/x-www-form-urlencoded" },
      body: "provider=github&next=https://evil.example",
    });
    expect(res.status).toBe(303);
    const location = new URL(res.headers.get("location") ?? "");
    expect(location.origin).toBe(new URL(API_URL).origin);
    expect(location.pathname).toBe("/auth/v1/authorize");
    expect(location.searchParams.get("provider")).toBe("github");
    expect(location.searchParams.get("code_challenge")).toBeTruthy();
    expect(location.searchParams.get("scopes")).toBe("user:email");
    expect(location.searchParams.get("redirect_to")).toBe(
      `${DASHBOARD_URL}/auth/callback?next=%2Fdashboard`,
    );
  });

  it("AUTH-02 auth cookies set by the server are HttpOnly and SameSite=Lax", async () => {
    const res = await fetch(`${DASHBOARD_URL}/auth/sign-in`, {
      method: "POST",
      redirect: "manual",
      headers: { origin: DASHBOARD_URL, "content-type": "application/x-www-form-urlencoded" },
      body: "provider=github",
    });
    const authCookies = res.headers.getSetCookie().filter((c) => c.startsWith("sb-"));
    expect(authCookies.length).toBeGreaterThan(0);
    for (const c of authCookies) {
      expect(c).toMatch(/;\s*HttpOnly/i);
      expect(c).toMatch(/;\s*SameSite=lax/i);
    }
  });

  it("AUTH-03 a prefetch header cannot skip authentication (review of #44)", async () => {
    const api = await fetch(`${DASHBOARD_URL}/api/extension/link`, {
      redirect: "manual",
      headers: { "next-router-prefetch": "1" },
    });
    expect(api.status).toBe(401);
    const page = await fetch(`${DASHBOARD_URL}/settings`, {
      redirect: "manual",
      headers: { purpose: "prefetch" },
    });
    expect(page.status).toBe(307);
    expect(location(page)).toBe(`${DASHBOARD_URL}/sign-in?next=%2Fsettings`);
  });

  it("AUTH-03 a signed-out POST to a protected route is redirected with 303 (not re-posted)", async () => {
    const res = await fetch(`${DASHBOARD_URL}/auth/sign-out`, {
      method: "POST",
      redirect: "manual",
    });
    expect(res.status).toBe(303);
  });

  it("SEC-08 state-changing routes reject foreign origins", async () => {
    for (const path of ["/auth/sign-in", "/auth/sign-out"]) {
      const res = await fetch(`${DASHBOARD_URL}${path}`, {
        method: "POST",
        redirect: "manual",
        headers: { cookie, origin: "https://evil.example" },
      });
      expect(res.status, path).toBe(403);
    }
  });

  it("AUTH-04 sign-out clears the cookies and revokes the dashboard session", async () => {
    const res = await fetch(`${DASHBOARD_URL}/auth/sign-out`, {
      method: "POST",
      redirect: "manual",
      headers: { cookie, origin: DASHBOARD_URL },
    });
    expect(res.status).toBe(303);
    expect(location(res)).toBe(`${DASHBOARD_URL}/sign-in`);
    const cleared = res.headers.getSetCookie().filter((c) => c.includes("auth-token"));
    expect(cleared.length).toBeGreaterThan(0);
    for (const c of cleared) expect(c).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/i);

    const client = createClient(API_URL, PUBLISHABLE_KEY, { auth: { persistSession: false } });
    const refreshed = await client.auth.refreshSession({ refresh_token: refreshToken });
    expect(refreshed.error).not.toBeNull();
  });
});
