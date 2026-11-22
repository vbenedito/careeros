/**
 * TEST-01 (#142): layout of the dashboard's pages at every width in real Chromium — privacy and
 * sign-in signed out; dashboard (week and month, with sample data) and settings signed in; the
 * mobile drawer closed and open at 390 px; for an account with problem tracking on, the dashboard's
 * coding problems card (PRB-11, DASH-17) and Settings' "Also delete your problem history?" dialog
 * (PRB-16, DASH-16); /admin for an admin account (#232, #252, ADM-09..20), in light and dark, closed
 * and with every <details> opened in the browser, with the GitHub reads answered by
 * scripts/ci/github-stub.ts (invented sessions, issues, PRs and workflow runs), so the cards,
 * charts, tables and the diagram render. Full-page screenshots go to responsive-screenshots/.
 */
import { randomUUID } from "node:crypto";
import { type Browser, type BrowserContext, chromium, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  clearOfMidnight,
  createOAuthUser,
  dashboardSession,
  env,
  MIDNIGHT_MARGIN_MS,
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

/** PRB-05 maximum: 100 characters, no hyphen, so the name cannot wrap at a break point. */
const LONG_SLUG = "a".repeat(100);
/** Problems seeded for the tracking-on account: [slug, minutes], all on this week's Monday. */
const PROBLEMS: ReadonlyArray<readonly [string, number]> = [
  [LONG_SLUG, 25],
  ["longest-substring-without-repeating-characters", 20],
  ["median-of-two-sorted-arrays", 15],
  ["two-sum", 10],
  ["3sum", 5],
];

const PAGES = [
  { name: "privacy", path: "/privacy", signedIn: false },
  { name: "sign-in", path: "/sign-in", signedIn: false },
  { name: "dashboard-week", path: "/dashboard?view=week", signedIn: true },
  { name: "dashboard-month", path: "/dashboard?view=month", signedIn: true },
  { name: "settings", path: "/settings", signedIn: true },
] as const;

describe("app pages responsive layout (TEST-01)", () => {
  let browser: Browser;
  type Cookies = Array<{ name: string; value: string }>;
  let cookies: Cookies;
  /** Session of the account with problem tracking on and stored problems (PRB-11, PRB-16). */
  let problemCookies: Cookies;
  /** Session of an account with a row in `admins` (ADM-01), for /admin (#232). */
  let adminCookies: Cookies;
  const contexts: BrowserContext[] = [];
  const stamp = Date.now();
  const email = `e2e-responsive-${stamp}@example.test`;
  const problemsEmail = `e2e-responsive-problems-${stamp}@example.test`;
  const adminEmail = `e2e-responsive-admin-${stamp}@example.test`;

  const open = async (
    path: string,
    width: number,
    signedIn: boolean,
    jar: Cookies = cookies,
    colorScheme: "light" | "dark" = "light",
  ): Promise<Page> => {
    const context = await browser.newContext({
      viewport: { width, height: 800 },
      deviceScaleFactor: 1,
      timezoneId: "UTC",
      colorScheme,
    });
    contexts.push(context);
    if (signedIn) {
      await context.addCookies([
        ...jar.map((c) => ({ ...c, url: DASHBOARD_URL })),
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
    // #82: the sample data is "this week" on the server; don't seed it just before Monday.
    await clearOfMidnight();
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
    // Second account: problem tracking on (clients can't write it, so seed it as postgres), with
    // problems on leetcode.com this week, one of them with the longest slug PRB-05 allows.
    const problemsUserId = createOAuthUser(problemsEmail);
    sql(`insert into public.tracked_domains (user_id, domain)
         values ('${problemsUserId}', 'leetcode.com');
         insert into public.account_settings (user_id, track_problems)
         values ('${problemsUserId}', true)`);
    for (const [slug, minutes] of PROBLEMS) {
      const id = randomUUID();
      sql(`insert into public.study_sessions (id, user_id, device_id, domain, started_at, ended_at)
           values ('${id}', '${problemsUserId}', gen_random_uuid(), 'leetcode.com',
                   '${monday}T12:00:00Z'::timestamptz,
                   '${monday}T12:00:00Z'::timestamptz + interval '${minutes} minutes');
           insert into public.study_session_problems (session_id, user_id, domain, problem_slug)
           values ('${id}', '${problemsUserId}', 'leetcode.com', '${slug}')`);
    }
    // Third account: an admin, seeded like the owner does it, by hand with SQL (ADM-01).
    const adminId = createOAuthUser(adminEmail);
    sql(`insert into public.admins (user_id) values ('${adminId}')`);
    browser = await chromium.launch({ channel: "chromium", headless: true });
    ({ cookies } = await dashboardSession(email));
    ({ cookies: problemCookies } = await dashboardSession(problemsEmail));
    ({ cookies: adminCookies } = await dashboardSession(adminEmail));
  }, MIDNIGHT_MARGIN_MS + 60_000);

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

  for (const width of WIDTHS) {
    it(`TEST-01 PRB-11 DASH-17 problems card at ${width}px: no overflow, touch targets`, async () => {
      const page = await open("/dashboard?view=week", width, true, problemCookies);
      const card = page.getByTestId("problems-card");
      await card.waitFor();
      // Every seeded problem is listed, the 100-character one with its full name (PRB-12).
      expect(await page.getByTestId("problems-list").locator("li").count()).toBe(PROBLEMS.length);
      await expect.poll(() => card.getByText(`A${"a".repeat(99)}`).count()).toBe(1);
      await saveScreenshot(page, `dashboard-problems-${width}`);
      await assertResponsive(page, { label: "dashboard with problems card" });
    });

    it(`TEST-01 PRB-16 DASH-16 history dialog at ${width}px: no overflow, touch targets`, async () => {
      const page = await open("/settings", width, true, problemCookies);
      const toggle = page.getByRole("switch", { name: "Track coding problems" });
      const dialog = page.getByRole("dialog", { name: "Also delete your problem history?" });
      expect(await toggle.getAttribute("aria-checked")).toBe("true");
      // Stored problems exist, so turning the switch off asks first. A click before React has
      // hydrated does nothing, so click again until the dialog is up.
      await expect
        .poll(
          async () => {
            if (!(await dialog.isVisible())) await toggle.click();
            return dialog.isVisible();
          },
          { timeout: 15_000 },
        )
        .toBe(true);
      for (const name of ["Turn off and keep history", "Turn off and delete history", "Cancel"]) {
        expect(await dialog.getByRole("button", { name }).isVisible()).toBe(true);
      }
      await saveScreenshot(page, `settings-problems-dialog-${width}`);
      await assertResponsive(page, { label: "settings, history dialog open" });
    });
  }

  for (const scheme of ["light", "dark"] as const) {
    for (const width of WIDTHS) {
      // Closed (the page as it loads) and with every <details> opened in the browser: the page has
      // no query flag for that (ADM-20.6). The stub (github-stub.ts) fills every chart and gives
      // the health card a mix of statuses, so the cards render with data, not as errors.
      for (const details of ["closed", "open"] as const) {
        it(`TEST-01 ADM-17 ADM-20 /admin ${scheme} at ${width}px, Details ${details}: no overflow, touch targets`, async () => {
          const page = await open("/admin", width, true, adminCookies, scheme);
          await page.getByRole("heading", { name: "Agent cost" }).waitFor();
          await page.getByRole("heading", { name: "How it connects" }).waitFor();
          expect(await page.getByText("unavailable").count()).toBe(0);
          expect(await page.locator("table").count()).toBeGreaterThan(0);
          // ADM-18: the stub's six workflows give every status but Unknown.
          for (const word of ["Passing", "Stale", "Failing", "Cancelled", "No run yet"])
            await page.getByText(word, { exact: true }).first().waitFor();
          await page.getByText("last good backup 3 days ago").waitFor();
          // ADM-20.4: each chart has an aria-label; ADM-20.5: Details are closed by default and
          // every summary is at least 44 px high.
          expect(await page.locator("[role=img][aria-label]").count()).toBeGreaterThanOrEqual(4);
          const total = await page.locator("details").count();
          expect(total).toBeGreaterThanOrEqual(7);
          expect(await page.locator("details[open]").count()).toBe(0);
          const heights = await page
            .locator("details > summary")
            .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
          for (const h of heights) expect(h).toBeGreaterThanOrEqual(43.5);
          if (details === "open") {
            await page.evaluate(() => {
              for (const d of document.querySelectorAll("details")) d.open = true;
            });
            expect(await page.locator("details[open]").count()).toBe(total);
            // The tables inside are now rendered, with the stub's sessions.
            await page.getByText("Second fixture session").first().waitFor();
          }
          // ADM-08: the server read the ledger with the token; it must not be in the page.
          const canary = process.env.OPS_LEDGER_TOKEN;
          if (canary) expect(await page.content()).not.toContain(canary);
          // The theme class is applied by next-themes after load: wait for it, then measure.
          await expect
            .poll(() => page.evaluate(() => document.documentElement.classList.contains("dark")))
            .toBe(scheme === "dark");
          await saveScreenshot(page, `admin-${scheme}-${width}-details-${details}`);
          await assertResponsive(page, {
            label: `admin (${scheme}, ${details})`,
            touchTargets: ["summary"],
          });
        });
      }
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
