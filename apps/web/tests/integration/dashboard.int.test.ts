/**
 * Dashboard data against the real local stack (DASH-04..07, DASH-15, DATA-10/11): seeded
 * sessions, the viewer's time zone from the `tz` cookie, and period navigation by URL.
 */
import { describe, expect, it } from "vitest";
import { clearOfMidnight, createOAuthUser, dashboardSession, env, sql } from "./helpers";

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
    const { status, html } = await page(
      "/dashboard?view=week&date=2026-10-28",
      cookie,
      "America/Sao_Paulo",
    );
    expect(status).toBe(200);
    expect(text(html, "period-label")).toBe("Oct 26 – Nov 1, 2026");
    expect(text(html, "card-period-value")).toBe("45m");
  });

  it("DASH-07 days are aggregated in the viewer's time zone from the tz cookie", async () => {
    const { id, cookie } = await seededUser();
    // 01:30 UTC on Mon Nov 2 = 22:30 on Sun Nov 1 in São Paulo (previous week there).
    addSession(id, "2026-11-02T01:30:00Z", 10);
    const inUtc = await page("/dashboard?view=week&date=2026-11-02", cookie, "UTC");
    const inSaoPaulo = await page(
      "/dashboard?view=week&date=2026-11-02",
      cookie,
      "America/Sao_Paulo",
    );
    expect(text(inUtc.html, "card-period-value")).toBe("10m");
    expect(text(inSaoPaulo.html, "card-period-value")).toBe("0m");
  });

  it("DASH-07 an invalid tz cookie falls back to UTC instead of failing", async () => {
    const { cookie } = await seededUser();
    const { status, html } = await page("/", cookie, "Mars/Olympus");
    expect(status).toBe(200);
    expect(text(html, "period-label")).toBe("This week");
  });

  it("DASH-07 a zone Node accepts but Postgres does not know falls back to UTC (no broken page)", async () => {
    const { id, cookie } = await seededUser();
    addSession(id, "2026-10-27T15:00:00Z", 30);
    // Intl accepts any letter case; pg_timezone_names compares exactly.
    const { status, html } = await page(
      "/dashboard?view=week&date=2026-10-28",
      cookie,
      "america/sao_paulo",
    );
    expect(status).toBe(200);
    expect(text(html, "card-period-value")).toBe("30m");
  });

  it("DASH-06 cards: today stays today; the period card and the top platform follow the period", async () => {
    await clearOfMidnight(60_000); // #82: "today" is seeded, then read back from the server
    const { id, cookie } = await seededUser();
    const now = Date.now();
    const midnightUtc = now - (now % 86_400_000);
    addSession(id, new Date(Math.max(midnightUtc, now - 20 * 60_000)).toISOString(), 12); // today (UTC)
    addSession(id, "2026-10-27T15:00:00Z", 30, "neetcode.io");
    addSession(id, "2026-10-28T15:00:00Z", 10, "leetcode.com");
    const { html } = await page("/dashboard?view=week&date=2026-10-28", cookie, "UTC");
    expect(text(html, "card-today-value")).toBe("12m");
    expect(text(html, "card-period-value")).toBe("40m");
    expect(text(html, "card-top-value")).toBe("30m");
    expect(html).toContain('data-value="neetcode.io · 75%"');
    // DASH-09: the donut legend agrees with the card.
    expect(html).toContain('data-testid="platform-legend"');
    expect(html).toMatch(/data-percent="75"[^>]*>.*?neetcode\.io/s);
    expect(html).toMatch(/data-percent="25"[^>]*>.*?leetcode\.com/s);
  }, 90_000);

  it("DASH-06 top platform is — when the period has no data", async () => {
    const { cookie } = await seededUser();
    const { html } = await page("/dashboard?view=week&date=2026-10-28", cookie, "UTC");
    expect(text(html, "card-top-value")).toBe("—");
    // DASH-11: no charts, the empty state instead (its Connect CTA is checked in real Chromium).
    expect(html).toContain('data-testid="empty-state"');
    expect(html).not.toContain('data-testid="activity-chart"');
  });

  it("DASH-04 months by URL", async () => {
    const { id, cookie } = await seededUser();
    addSession(id, "2026-10-01T12:00:00Z", 25);
    addSession(id, "2026-10-31T12:00:00Z", 5);
    const { html } = await page("/dashboard?view=month&date=2026-10-15", cookie, "UTC");
    expect(text(html, "period-label")).toBe("Oct 2026");
    expect(text(html, "card-period-value")).toBe("30m");
  });
});
