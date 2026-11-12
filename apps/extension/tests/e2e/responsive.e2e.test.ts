/**
 * TEST-01 (#142): layout of the dashboard's pages at every width in real Chromium — privacy and
 * sign-in signed out; dashboard (week and month, with sample data) and settings signed in; the
 * mobile drawer closed and open at 390 px. Full-page screenshots go to responsive-screenshots/.
 */
import { type Browser, type BrowserContext, chromium, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createOAuthUser,
  dashboardSession,
  env,
  sql,
} from "../../../web/tests/integration/helpers";
import { assertResponsive, saveScreenshot, WIDTHS } from "../support/responsive";

const DASHBOARD_URL = env("DASHBOARD_URL");

/** Monday of the current UTC week, as YYYY-MM-DD. */
function mondayUtc(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

const PAGES = [
  { name: "privacy", path: "/privacy", signedIn: false },
  { name: "sign-in", path: "/sign-in", signedIn: false },
  { name: "dashboard-week", path: "/dashboard?view=week", signedIn: true },
  { name: "dashboard-month", path: "/dashboard?view=month", signedIn: true },
  { name: "settings", path: "/settings", signedIn: true },
] as const;

describe("app pages responsive layout (TEST-01)", () => {
  let browser: Browser;
  let cookies: Array<{ name: string; value: string }>;
  const contexts: BrowserContext[] = [];
  const email = `e2e-responsive-${Date.now()}@example.test`;

  const open = async (path: string, width: number, signedIn: boolean): Promise<Page> => {
    const context = await browser.newContext({
      viewport: { width, height: 800 },
      deviceScaleFactor: 1,
      timezoneId: "UTC",
    });
    contexts.push(context);
    if (signedIn) {
      await context.addCookies([
        ...cookies.map((c) => ({ ...c, url: DASHBOARD_URL })),
        { name: "tz", value: "UTC", url: DASHBOARD_URL },
      ]);
    }
    const page = await context.newPage();
    await page.goto(`${DASHBOARD_URL}${path}`, { waitUntil: "networkidle" });
    expect(new URL(page.url()).pathname).toBe(path.split("?")[0]);
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    return page;
  };

  beforeAll(async () => {
    const userId = createOAuthUser(email);
    // Sample data: several days and sites this week, so both charts and the legend render.
    const monday = mondayUtc();
    const sites = ["leetcode.com", "neetcode.io", "docs.python.org"];
    for (const [i, domain] of sites.entries()) {
      sql(`insert into public.tracked_domains (user_id, domain) values ('${userId}', '${domain}');
           insert into public.study_sessions (id, user_id, device_id, domain, started_at, ended_at)
           values (gen_random_uuid(), '${userId}', gen_random_uuid(), '${domain}',
                   '${monday}T12:00:00Z'::timestamptz,
                   '${monday}T12:00:00Z'::timestamptz + interval '${10 + i * 8} minutes')`);
    }
    browser = await chromium.launch({ channel: "chromium", headless: true });
    ({ cookies } = await dashboardSession(email));
  });

  afterAll(async () => {
    for (const c of contexts) await c.close();
    await browser?.close();
  });

  for (const { name, path, signedIn } of PAGES) {
    for (const width of WIDTHS) {
      it(`TEST-01 ${name} at ${width}px: no overflow, touch targets`, async () => {
        const page = await open(path, width, signedIn);
        await saveScreenshot(page, `${name}-${width}`);
        await assertResponsive(page, { label: name });
      });
    }
  }

  it("TEST-01 DASH-02 the mobile drawer at 390px, closed and open", async () => {
    const page = await open("/dashboard?view=week", 390, true);
    const trigger = page.getByRole("button", { name: "Open menu" });
    await expect.poll(() => trigger.getAttribute("aria-expanded")).toBe("false");
    await assertResponsive(page, { label: "dashboard, drawer closed" });

    await trigger.click();
    const drawer = page.getByRole("dialog", { name: "Main navigation" });
    await expect.poll(() => drawer.isVisible()).toBe(true);
    // Let the slide-in finish before measuring.
    await page.waitForFunction(() =>
      (document.getElementById("mobile-sidebar")?.getAnimations({ subtree: true }) ?? []).every(
        (a) => a.playState !== "running",
      ),
    );
    await saveScreenshot(page, "dashboard-390-drawer-open");
    await assertResponsive(page, { label: "dashboard, drawer open" });

    await page.keyboard.press("Escape");
    await expect.poll(() => drawer.count()).toBe(0);
  });
});
