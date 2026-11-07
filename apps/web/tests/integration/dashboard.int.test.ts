/**
 * Dashboard data against the real local stack (DASH-04..07, DASH-15, DATA-10/11): seeded
 * sessions, the viewer's time zone from the `tz` cookie, and period navigation by URL.
 */
import { describe, expect, it } from "vitest";
import { createOAuthUser, dashboardSession, env, sql } from "./helpers";

const DASHBOARD_URL = env("DASHBOARD_URL");

async function seededUser() {
  const email = `dash-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.test`;
  const id = createOAuthUser(email);
  const { header } = await dashboardSession(email);
  return { id, cookie: header };
}

function addSession(userId: string, startIso: string, minutes: number, domain = "leetcode.com") {
  sql(`insert into public.study_sessions (id, user_id, device_id, domain, started_at, ended_at)
       values (gen_random_uuid(), '${userId}', gen_random_uuid(), '${domain}',
               '${startIso}'::timestamptz, '${startIso}'::timestamptz + interval '${minutes} minutes')`);
}

const page = (path: string, cookie: string, tz?: string) =>
  fetch(`${DASHBOARD_URL}${path}`, {
    headers: { cookie: tz ? `${cookie}; tz=${encodeURIComponent(tz)}` : cookie },
  }).then(async (r) => ({ status: r.status, html: await r.text() }));

const text = (html: string, testId: string) =>
  new RegExp(`data-testid="${testId}"[^>]*>([^<]*)<`).exec(html)?.[1];

describe("dashboard data (integration)", () => {
  it("DASH-04 DASH-05 a past week by URL shows that week's total", async () => {
    const { id, cookie } = await seededUser();
    addSession(id, "2026-10-27T15:00:00Z", 30); // Tue in the week of Oct 26
    addSession(id, "2026-10-28T15:00:00Z", 15);
    addSession(id, "2026-11-03T15:00:00Z", 20); // next week: not included
    const { status, html } = await page("/?view=week&date=2026-10-28", cookie, "America/Sao_Paulo");
    expect(status).toBe(200);
    expect(text(html, "period-label")).toBe("Oct 26 – Nov 1, 2026");
    expect(text(html, "period-seconds")).toBe("45m");
  });

  it("DASH-07 days are aggregated in the viewer's time zone from the tz cookie", async () => {
    const { id, cookie } = await seededUser();
    // 01:30 UTC on Mon Nov 2 = 22:30 on Sun Nov 1 in São Paulo (previous week there).
    addSession(id, "2026-11-02T01:30:00Z", 10);
    const inUtc = await page("/?view=week&date=2026-11-02", cookie, "UTC");
    const inSaoPaulo = await page("/?view=week&date=2026-11-02", cookie, "America/Sao_Paulo");
    expect(text(inUtc.html, "period-seconds")).toBe("10m");
    expect(text(inSaoPaulo.html, "period-seconds")).toBe("0m");
  });

  it("DASH-07 an invalid tz cookie falls back to UTC instead of failing", async () => {
    const { cookie } = await seededUser();
    const { status, html } = await page("/", cookie, "Mars/Olympus");
    expect(status).toBe(200);
    expect(text(html, "period-label")).toBe("This week");
  });

  it("DASH-04 months by URL", async () => {
    const { id, cookie } = await seededUser();
    addSession(id, "2026-10-01T12:00:00Z", 25);
    addSession(id, "2026-10-31T12:00:00Z", 5);
    const { html } = await page("/?view=month&date=2026-10-15", cookie, "UTC");
    expect(text(html, "period-label")).toBe("Oct 2026");
    expect(text(html, "period-seconds")).toBe("30m");
  });
});
