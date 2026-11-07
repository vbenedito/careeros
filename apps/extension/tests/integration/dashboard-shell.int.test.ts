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

    await page.getByRole("button", { name: "Theme" }).click();
    await page.getByRole("menuitemradio", { name: "Dark" }).click();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.className))
      .toContain("dark");

    await page.getByRole("button", { name: "Collapse sidebar" }).click();
    expect((await context.cookies()).find((c) => c.name === "sidebar_state")?.value).toBe("false");
    expect(cspErrors).toEqual([]);
    await page.close();
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
