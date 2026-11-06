/**
 * End to end: the dashboard's /connect page connects the real extension in real Chromium
 * (AUTH §3 flow, AUTH-07a/08/09). Needs the running dashboard (DASHBOARD_URL) and local Supabase.
 */
import { resolve } from "node:path";
import { type BrowserContext, chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// Same users and cookie format as the dashboard's own integration tests.
import { createOAuthUser, dashboardSession, env } from "../../../web/tests/integration/helpers";

const DASHBOARD_URL = env("DASHBOARD_URL");
const EXTENSION_DIR = resolve(import.meta.dirname, "../../dist/development");

async function signIn(context: BrowserContext, email: string) {
  const { cookies } = await dashboardSession(email);
  await context.addCookies(cookies.map((c) => ({ ...c, url: DASHBOARD_URL })));
}

describe("/connect page (real Chromium + real extension)", () => {
  let context: BrowserContext;
  const email = `connect-${Date.now()}@example.test`;

  beforeAll(async () => {
    createOAuthUser(email);
    context = await chromium.launchPersistentContext("", {
      channel: "chromium",
      headless: true,
      args: [`--disable-extensions-except=${EXTENSION_DIR}`, `--load-extension=${EXTENSION_DIR}`],
    });
    if (context.serviceWorkers().length === 0) await context.waitForEvent("serviceworker");
    await signIn(context, email);
  });

  afterAll(async () => {
    await context?.close();
  });

  it("without the extension, the page shows install guidance", async () => {
    const browser = await chromium.launch({ channel: "chromium", headless: true });
    const plain = await browser.newContext();
    await signIn(plain, email);
    const page = await plain.newPage();
    await page.goto(`${DASHBOARD_URL}/connect`);
    const state = page.getByTestId("connect-state");
    await expect.poll(() => state.getAttribute("data-state")).toBe("not-installed");
    expect(await state.textContent()).toContain("Load unpacked");
    await browser.close();
  });

  it("Connect extension → the extension holds its own session for the signed-in user", async () => {
    const page = await context.newPage();
    await page.goto(`${DASHBOARD_URL}/connect`);
    const state = page.getByTestId("connect-state");
    await expect.poll(() => state.getAttribute("data-state")).toBe("not-connected");

    await page.getByRole("button", { name: "Connect extension" }).click();
    await expect.poll(() => state.getAttribute("data-state")).toBe("connected");
    expect(await page.getByTestId("connected-email").textContent()).toBe(email);

    // A fresh visit reads the status from the extension again.
    await page.reload();
    await expect.poll(() => state.getAttribute("data-state")).toBe("connected");
    await page.close();
  });
});
