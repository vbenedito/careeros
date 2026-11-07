/**
 * Settings against the real local stack: tracked-site CRUD (DASH-12), sign out of all devices
 * (AUTH-12a) and account deletion (DASH-14, DATA-12, AUTH-13, SEC-14).
 */
import { describe, expect, it } from "vitest";
import { createOAuthUser, dashboardSession, env, sql } from "./helpers";

const DASHBOARD_URL = env("DASHBOARD_URL");

async function signedInUser(label: string) {
  const email = `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
  const id = createOAuthUser(email);
  return { id, email, cookie: (await dashboardSession(email)).header };
}

const call = (path: string, cookie: string, init: RequestInit = {}, origin = DASHBOARD_URL) =>
  fetch(`${DASHBOARD_URL}${path}`, {
    redirect: "manual",
    ...init,
    headers: { cookie, origin, ...(init.headers as Record<string, string>) },
  });

const addSite = (cookie: string, domain: unknown, origin?: string) =>
  call(
    "/api/sites",
    cookie,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ domain }),
    },
    origin,
  );

const form = (fields: Record<string, string>) => ({
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams(fields).toString(),
});

describe("settings (integration)", () => {
  it("DASH-12 add (normalized, idempotent), list on the page, remove", async () => {
    const { id, cookie } = await signedInUser("sites");
    const added = await addSite(cookie, "https://www.LeetCode.com/problems/two-sum");
    expect(added.status).toBe(201);
    expect(added.headers.get("cache-control")).toBe("no-store");
    const site = await added.json();
    expect(site).toEqual({ id: expect.any(String), domain: "leetcode.com" });

    const again = await addSite(cookie, "leetcode.com");
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual(site);

    const html = await (await call("/settings", cookie)).text();
    expect(html).toContain('data-testid="site-list"');
    expect(html).toContain("leetcode.com");

    const removed = await call(`/api/sites/${site.id}`, cookie, { method: "DELETE" });
    expect(removed.status).toBe(200);
    expect(sql(`select count(*) from public.tracked_domains where user_id = '${id}'`)).toBe("0");
    // Idempotent: removing it again still succeeds.
    expect((await call(`/api/sites/${site.id}`, cookie, { method: "DELETE" })).status).toBe(200);
  });

  it("DASH-12 invalid input is rejected with a code", async () => {
    const { cookie } = await signedInUser("invalid");
    for (const domain of ["", "com", "not a site", "a@b.com", 42]) {
      const res = await addSite(cookie, domain);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "INVALID_DOMAIN" });
    }
  });

  it("DATA-01 the 51st site is refused with LIMIT_REACHED", async () => {
    const { id, cookie } = await signedInUser("limit");
    sql(`insert into public.tracked_domains (user_id, domain)
         select '${id}', 'site' || g || '.com' from generate_series(1, 50) g`);
    const res = await addSite(cookie, "one-more.com");
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "LIMIT_REACHED" });
  });

  it("DATA-04 a user cannot remove another user's site", async () => {
    const owner = await signedInUser("owner");
    const other = await signedInUser("other");
    const site = await (await addSite(owner.cookie, "neetcode.io")).json();
    expect((await call(`/api/sites/${site.id}`, other.cookie, { method: "DELETE" })).status).toBe(
      200,
    );
    expect(sql(`select count(*) from public.tracked_domains where id = '${site.id}'`)).toBe("1");
  });

  it("SEC-08 site changes from a foreign origin are refused; no session is 401", async () => {
    const { cookie } = await signedInUser("csrf");
    expect((await addSite(cookie, "leetcode.com", "https://evil.example")).status).toBe(403);
    const anonymous = await fetch(`${DASHBOARD_URL}/api/sites`, {
      method: "POST",
      headers: { origin: DASHBOARD_URL },
      body: "{}",
    });
    expect(anonymous.status).toBe(401);
  });

  it("AUTH-12a sign out of all devices revokes every session of the user", async () => {
    const { id, email, cookie } = await signedInUser("global");
    await dashboardSession(email); // a second device (e.g. the extension)
    expect(Number(sql(`select count(*) from auth.sessions where user_id = '${id}'`))).toBe(2);
    const res = await call("/auth/sign-out", cookie, form({ scope: "global" }));
    expect(res.status).toBe(303);
    expect(new URL(res.headers.get("location") ?? "").pathname).toBe("/sign-in");
    expect(sql(`select count(*) from auth.sessions where user_id = '${id}'`)).toBe("0");
  });

  it("AUTH-04 plain sign out keeps the other sessions", async () => {
    const { id, email, cookie } = await signedInUser("local");
    await dashboardSession(email);
    await call("/auth/sign-out", cookie, form({}));
    expect(sql(`select count(*) from auth.sessions where user_id = '${id}'`)).toBe("1");
  });

  it("DASH-14 DATA-12 SEC-14 deleting the account removes the user and all data", async () => {
    const { id, cookie } = await signedInUser("delete");
    await addSite(cookie, "leetcode.com");
    sql(`insert into public.study_sessions (id, user_id, device_id, domain, started_at, ended_at)
         values (gen_random_uuid(), '${id}', gen_random_uuid(), 'leetcode.com',
                 now() - interval '1 hour', now() - interval '30 minutes')`);

    // Without the typed confirmation nothing happens.
    const unconfirmed = await call("/api/account/delete", cookie, form({ confirm: "delete" }));
    expect(unconfirmed.status).toBe(303);
    expect(unconfirmed.headers.get("location")).toContain("/settings?error=delete");
    expect(sql(`select count(*) from auth.users where id = '${id}'`)).toBe("1");

    const res = await call("/api/account/delete", cookie, form({ confirm: "DELETE" }));
    expect(res.status).toBe(303);
    expect(new URL(res.headers.get("location") ?? "").pathname).toBe("/sign-in");
    expect(res.headers.getSetCookie().some((c) => /sb-.*-auth-token/.test(c))).toBe(true);
    expect(
      sql(`select (select count(*) from auth.users where id = '${id}')
                + (select count(*) from public.tracked_domains where user_id = '${id}')
                + (select count(*) from public.study_sessions where user_id = '${id}')
                + (select count(*) from auth.sessions where user_id = '${id}')`),
    ).toBe("0");
  });

  it("DASH-14 account deletion from a foreign origin is refused", async () => {
    const { id, cookie } = await signedInUser("delete-csrf");
    const res = await call(
      "/api/account/delete",
      cookie,
      form({ confirm: "DELETE" }),
      "https://evil.example",
    );
    expect(res.status).toBe(403);
    expect(sql(`select count(*) from auth.users where id = '${id}'`)).toBe("1");
  });
});
