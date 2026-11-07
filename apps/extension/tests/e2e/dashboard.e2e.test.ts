/**
 * E2E (a): the dashboard journey of a seeded user in real Chromium (TEST §2) — sign-in via a test
 * session, period navigation, tracked-site CRUD in Settings and account deletion; plus the
 * sign-in form's first OAuth hop under the nonce CSP (form-action, #44).
 */
import { type Browser, type BrowserContext, chromium, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createOAuthUser,
  dashboardSession,
  env,
  sql,
} from "../../../web/tests/integration/helpers";

const DASHBOARD_URL = env("DASHBOARD_URL");
const API_URL = env("API_URL");

/** Monday of the current UTC week, as YYYY-MM-DD, shifted by `weeks`. */
function mondayUtc(weeks = 0): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + weeks * 7);
  return d.toISOString().slice(0, 10);
}

function addSession(userId: string, day: string, minutes: number, domain: string) {
  sql(`insert into public.study_sessions (id, user_id, device_id, domain, started_at, ended_at)
       values (gen_random_uuid(), '${userId}', gen_random_uuid(), '${domain}',
               '${day}T12:00:00Z'::timestamptz,
               '${day}T12:00:00Z'::timestamptz + interval '${minutes} minutes')`);
}

describe("dashboard journey (E2E)", () => {
  let browser: Browser;
  let context: BrowserContext;
  let userId: string;
  const email = `e2e-dash-${Date.now()}@example.test`;
  const cspErrors: string[] = [];

  const open = async (path: string): Promise<Page> => {
    const page = await context.newPage();
    page.on("console", (m) => {
      if (m.type() === "error" && /Content Security Policy/i.test(m.text()))
        cspErrors.push(m.text());
    });
    await page.goto(`${DASHBOARD_URL}${path}`);
    return page;
  };

  beforeAll(async () => {
    userId = createOAuthUser(email);
    // This week and last week have data (UTC, the zone the tz cookie will carry).
    addSession(userId, mondayUtc(0), 30, "leetcode.com");
    addSession(userId, mondayUtc(-1), 20, "neetcode.io"); // intervals are ≤ 30 min (TRK-09)
    browser = await chromium.launch({ channel: "chromium", headless: true });
    context = await browser.newContext({ timezoneId: "UTC" });
    const { cookies } = await dashboardSession(email);
    await context.addCookies([
      ...cookies.map((c) => ({ ...c, url: DASHBOARD_URL })),
      { name: "tz", value: "UTC", url: DASHBOARD_URL },
    ]);
  });

  afterAll(async () => {
    await browser?.close();
  });

  it("DASH-04 DASH-05 period navigation by clicking: previous week, back, month view", async () => {
    const page = await open("/");
    const label = page.getByTestId("period-label");
    await expect.poll(() => label.textContent()).toBe("This week");
    await expect.poll(() => page.getByTestId("card-period-value").textContent()).toBe("30m");

    await page.getByRole("link", { name: "Previous week" }).click();
    await page.waitForURL(/view=week&date=/);
    await expect.poll(() => page.getByTestId("card-period-value").textContent()).toBe("20m");
    await expect
      .poll(() => page.getByTestId("platform-legend").textContent())
      .toContain("neetcode.io");

    await page.getByRole("link", { name: "Today" }).click();
    await expect.poll(() => label.textContent()).toBe("This week");
    await page.getByRole("link", { name: "Month" }).click();
    await expect.poll(() => label.textContent()).toBe("This month");
    await page.close();
  });

  it("DASH-12 tracked-site CRUD through the Settings UI", async () => {
    const page = await open("/settings");
    const input = page.getByLabel("Add a site you study on");
    await input.fill("https://www.LeetCode.com/problems/two-sum");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    const list = page.getByTestId("site-list");
    await expect.poll(() => list.textContent()).toContain("leetcode.com");
    await expect.poll(() => input.inputValue()).toBe("");

    await input.fill("com");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect
      .poll(() => page.getByRole("alert").first().textContent())
      .toContain("website address");

    await page.getByRole("button", { name: "Remove leetcode.com" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Remove" }).click();
    await expect.poll(() => page.getByTestId("site-list").count()).toBe(0);
    expect(sql(`select count(*) from public.tracked_domains where user_id = '${userId}'`)).toBe(
      "0",
    );
    // SEC-09: the dialog's scroll lock injects a <style>; it must carry the CSP nonce.
    expect(cspErrors).toEqual([]);
    await page.close();
  });

  it("DASH-14 DATA-12 delete account with the typed confirmation", async () => {
    const page = await open("/settings");
    await page.getByRole("button", { name: "Delete account" }).click();
    const dialog = page.getByRole("dialog");
    const confirm = dialog.getByRole("button", { name: "Delete account" });
    expect(await confirm.isDisabled()).toBe(true);
    await dialog.getByLabel("Type DELETE to confirm").fill("DELETE");
    await confirm.click();
    await page.waitForURL(/\/sign-in\?deleted=1/);
    await expect
      .poll(() => page.getByRole("status").textContent())
      .toContain("Your account and all of its data were deleted");
    expect(
      sql(`select (select count(*) from auth.users where id = '${userId}')
                + (select count(*) from public.study_sessions where user_id = '${userId}')`),
    ).toBe("0");
    // The session is gone: the dashboard sends the browser back to sign-in.
    await page.goto(`${DASHBOARD_URL}/`);
    expect(new URL(page.url()).pathname).toBe("/sign-in");
    await page.close();
  });

  it("AUTH-01 SEC-09 the sign-in form reaches Supabase /authorize without CSP violations", async () => {
    const anonymous = await browser.newContext();
    const page = await anonymous.newPage();
    page.on("console", (m) => {
      if (m.type() === "error" && /Content Security Policy/i.test(m.text()))
        cspErrors.push(m.text());
    });
    await page.goto(`${DASHBOARD_URL}/sign-in`);
    const authorize = page.waitForRequest((r) =>
      r.url().startsWith(`${API_URL}/auth/v1/authorize`),
    );
    await page.getByRole("button", { name: "Continue with GitHub" }).click();
    const request = await authorize;
    // PKCE flow (AUTH-01) with the GitHub email scope (AUTH-05).
    const url = new URL(request.url());
    expect(url.searchParams.get("provider")).toBe("github");
    expect(url.searchParams.get("code_challenge_method")).toMatch(/^s256$/i);
    expect(url.searchParams.get("code_challenge")).toBeTruthy();
    // The provider hop itself needs real OAuth apps: checked manually (TEST §4.3, #31).
    await anonymous.close();
    expect(cspErrors).toEqual([]);
  });
});
