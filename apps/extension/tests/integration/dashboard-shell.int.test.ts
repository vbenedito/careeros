/**
 * Dashboard shell in real Chromium (DASH-01..03, AUTH-04): signed-in navigation, theme toggle
 * and sign-out through the account menu. Lives with the browser tests (Playwright).
 */
import { type Browser, type BrowserContext, chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createOAuthUser, dashboardSession, env } from "../../../web/tests/integration/helpers";

const DASHBOARD_URL = env("DASHBOARD_URL");

describe("dashboard shell (real Chromium)", () => {
  let browser: Browser;
  let context: BrowserContext;
  const email = `shell-${Date.now()}@example.test`;
  const cspErrors: string[] = [];

  beforeAll(async () => {
    createOAuthUser(email);
    browser = await chromium.launch({ channel: "chromium", headless: true });
    context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const { cookies } = await dashboardSession(email);
    await context.addCookies(cookies.map((c) => ({ ...c, url: DASHBOARD_URL })));
  });

  afterAll(async () => {
    await browser?.close();
  });

  it("DASH-01 DASH-03 sidebar, header and theme toggle render without CSP errors", async () => {
    const page = await context.newPage();
    page.on("console", (m) => {
      if (m.type() === "error" && /Content Security Policy|CSP/i.test(m.text()))
        cspErrors.push(m.text());
    });
    await page.goto(`${DASHBOARD_URL}/`);
    await expect
      .poll(() => page.getByRole("heading", { name: "Dashboard", level: 1 }).count())
      .toBe(1);
    expect(await page.getByRole("link", { name: "Settings" }).count()).toBeGreaterThan(0);

    // A click before hydration does nothing: retry until the menu is really open.
    const dark = page.getByRole("menuitemradio", { name: "Dark" });
    await expect
      .poll(
        async () => {
          if ((await dark.count()) === 0) await page.getByRole("button", { name: "Theme" }).click();
          return dark.count();
        },
        { timeout: 15_000, interval: 500 },
      )
      .toBe(1);
    await dark.click();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.className))
      .toContain("dark");

    await page.getByRole("button", { name: "Collapse sidebar" }).click();
    expect((await context.cookies()).find((c) => c.name === "sidebar_state")?.value).toBe("false");
    expect(cspErrors).toEqual([]);
    await page.close();
  });

  it("#94 clickable controls show the pointer cursor (buttons, menu items, links)", async () => {
    const page = await context.newPage();
    await page.goto(`${DASHBOARD_URL}/`);
    const cursor = (locator: ReturnType<typeof page.getByRole>) =>
      locator.first().evaluate((el) => getComputedStyle(el).cursor);
    await expect.poll(() => page.getByRole("button", { name: "Theme" }).count()).toBe(1);
    expect(await cursor(page.getByRole("button", { name: "Theme" }))).toBe("pointer");
    expect(await cursor(page.getByRole("button", { name: "Account menu" }))).toBe("pointer");
    expect(await cursor(page.getByRole("link", { name: "Month" }))).toBe("pointer");
    // Radix menu items render as divs with role="menuitem": they need the rule too.
    await page.getByRole("button", { name: "Account menu" }).click();
    const signOut = page.getByRole("menuitem", { name: "Sign out" });
    await expect.poll(() => signOut.count()).toBe(1);
    expect(await cursor(signOut)).toBe("pointer");
    await page.close();
  });

  it("DASH-11 a period without data shows the empty state with the Connect CTA (no extension here)", async () => {
    const page = await context.newPage();
    await page.goto(`${DASHBOARD_URL}/`);
    const empty = page.getByTestId("empty-state");
    await expect.poll(() => empty.count()).toBe(1);
    await expect
      .poll(() => empty.getByRole("link", { name: "Connect the extension" }).count())
      .toBe(1);
    await page.close();
  });

  it("SEC-13 the privacy page renders for a signed-out visitor", async () => {
    const anonymous = await browser.newContext();
    const page = await anonymous.newPage();
    await page.goto(`${DASHBOARD_URL}/privacy`);
    expect(await page.getByRole("heading", { name: "Privacy", level: 1 }).count()).toBe(1);
    await anonymous.close();
  });

  it("AUTH-04 Sign out from the account menu (mouse click) ends the dashboard session", async () => {
    const page = await context.newPage();
    await page.goto(`${DASHBOARD_URL}/`);
    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await page.waitForURL(/\/sign-in/);
    await page.goto(`${DASHBOARD_URL}/`);
    expect(new URL(page.url()).pathname).toBe("/sign-in");
    await page.close();
  });
});
