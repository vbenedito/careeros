/**
 * TEST-01 (#142): the landing page's layout at every width, in real Chromium, with no backend.
 * The page is `renderLanding(...)` served from memory (with its own CSP and the real font) by
 * request interception, so it runs in the CI checks job.
 */
import { readFileSync } from "node:fs";
import { type Browser, type BrowserContext, chromium, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildLandingCsp } from "../../../web/lib/landing/csp";
import { renderLanding } from "../../../web/lib/landing/page";
import {
  assertResponsive,
  findResponsiveViolations,
  type ResponsiveOptions,
  saveScreenshot,
  WIDTHS,
} from "../support/responsive";

const ORIGIN = "http://landing.test";
const HTML = renderLanding({
  siteUrl: ORIGIN,
  installUrl: "https://chromewebstore.google.com/search/CareerOS",
  repositoryUrl: "https://github.com/vbenedito/careeros",
});
const FONT = readFileSync(
  new URL("../../../web/public/fonts/mona-sans-latin-wght.woff2", import.meta.url),
);

/**
 * Final CTA pair and the privacy badge row under the hero stay centred (#140). The site belt is
 * a marquee: its text scrolls through a clipped band on purpose, so it is skipped while it
 * moves; with reduced motion it wraps and is checked.
 */
const STATIC_CHECKS: ResponsiveOptions = { centred: [".final .ctas", ".badges"] };
const CHECKS: ResponsiveOptions = { ...STATIC_CHECKS, ignore: [".belt"] };

/** CSS-only toggles: the input id and the label text a visitor taps. */
const TOGGLES = [
  ["pause", "Pause animations"],
  ["away", "Step away from the keyboard"],
  ["c-py", "docs.python.org"],
  ["c-yt", "youtube.com"],
  ["v-month", "Month"],
  ["r-measured", "Measured"],
] as const;

describe("landing responsive layout (TEST-01)", () => {
  let browser: Browser;
  const contexts: BrowserContext[] = [];

  const open = async (
    width: number,
    reducedMotion: "reduce" | "no-preference" = "no-preference",
  ): Promise<Page> => {
    const context = await browser.newContext({
      viewport: { width, height: 800 },
      deviceScaleFactor: 1,
      reducedMotion,
    });
    contexts.push(context);
    await context.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== ORIGIN) return route.abort();
      if (url.pathname === "/") {
        return route.fulfill({
          contentType: "text/html; charset=utf-8",
          headers: { "Content-Security-Policy": buildLandingCsp(false) },
          body: HTML,
        });
      }
      if (url.pathname === "/fonts/mona-sans-latin-wght.woff2") {
        return route.fulfill({ contentType: "font/woff2", body: FONT });
      }
      return route.fulfill({ status: 404, body: "" });
    });
    const page = await context.newPage();
    await page.goto(`${ORIGIN}/`);
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    expect(await page.evaluate(() => document.fonts.check('16px "Mona Sans"'))).toBe(true);
    return page;
  };

  beforeAll(async () => {
    browser = await chromium.launch({ channel: "chromium", headless: true });
  });

  afterAll(async () => {
    for (const c of contexts) await c.close();
    await browser?.close();
  });

  it("TEST-01 the checker reports overflow, off-centre groups and small touch targets", async () => {
    const page = await (
      await browser.newContext({ viewport: { width: 390, height: 600 } })
    ).newPage();
    const check = async (body: string, options: ResponsiveOptions = {}) => {
      await page.setContent(`<body style="margin:0">${body}</body>`);
      return findResponsiveViolations(page, options);
    };

    let found = await check(
      `
      <div style="width:500px">wide</div>
      <div style="display:flex;justify-content:flex-start;width:390px"><p class="g" style="margin:0"><a>one</a></p></div>
      <button style="height:30px">tap</button>`,
      { centred: [".g"] },
    );
    expect(found.join("\n")).toMatch(/horizontal scroll: document is 500px wide/);
    expect(found.join("\n")).toMatch(/outside the viewport: div \{x: 0, y: 0, w: 500/);
    expect(found.join("\n")).toMatch(/not centred: \.g/);
    expect(found.join("\n")).toMatch(/touch target under 44px: button "tap"/);
    expect(found).toHaveLength(4);

    // Allowed: a wide box inside a clipping box and a horizontal scroller that fit the viewport.
    found = await check(`
      <div style="overflow:hidden;width:100px"><div style="width:900px;height:10px"></div></div>
      <div style="overflow-x:auto;width:390px"><div style="width:900px">a wide table to swipe</div></div>`);
    expect(found).toEqual([]);

    // A clipping parent wider than the viewport exempts nothing.
    found = await check(`
      <div style="overflow:hidden;width:600px"><div style="width:900px;height:10px"></div></div>`);
    expect(found.join("\n")).toMatch(/outside the viewport: div \{x: 0, y: 0, w: 600/);
    // The same with a horizontal scroller wider than the viewport.
    found = await check(
      `<div style="overflow-x:auto;width:600px"><div style="width:900px;height:10px"></div></div>`,
    );
    expect(found.join("\n")).toMatch(/outside the viewport: div \{x: 0, y: 0, w: 600/);

    // Text cut off by a clipping parent, or by the element itself without an ellipsis.
    found = await check(`
      <div style="overflow:hidden;width:100px"><span style="white-space:nowrap">a sentence far too long for its box</span></div>
      <p style="overflow:hidden;white-space:nowrap;width:100px">another sentence far too long</p>
      <p style="overflow:hidden;white-space:nowrap;text-overflow:ellipsis;width:100px">truncated on purpose with an ellipsis</p>`);
    expect(found).toHaveLength(2);
    expect(found[0]).toMatch(/clipped text: div > span "a sentence far too long/);
    expect(found[1]).toMatch(/clipped text: p "another sentence/);

    // Fixed elements are held to the viewport even inside a clipping box.
    found = await check(`
      <div style="overflow:hidden;width:100px"><div style="position:fixed;left:200px;top:0;width:300px;height:10px"></div></div>`);
    expect(found.join("\n")).toMatch(/outside the viewport: div > div \{x: 200, y: 0, w: 300/);
    await page.context().close();
  });

  for (const width of WIDTHS) {
    it(`TEST-01 landing at ${width}px: no overflow, centred groups, touch targets`, async () => {
      const page = await open(width);
      await saveScreenshot(page, `landing-${width}`);
      await assertResponsive(page, { ...CHECKS, label: "landing" });
    });
  }

  it("TEST-01 landing at 390px: every CSS-only toggle state keeps the layout", async () => {
    const page = await open(390);
    for (const [id, label] of TOGGLES) {
      await page.locator(`label[for="${id}"]`).filter({ hasText: label }).click();
      expect(await page.locator(`#${id}`).isChecked()).toBe(true);
      await saveScreenshot(page, `landing-390-${id}`);
      await assertResponsive(page, { ...CHECKS, label: `landing, ${id} checked` });
    }
    // Back to the radio defaults.
    for (const id of ["v-week", "r-remembered"]) {
      await page.locator(`label[for="${id}"]`).click();
      await assertResponsive(page, { ...CHECKS, label: `landing, ${id} checked` });
    }
  });

  it("TEST-01 landing at 360px with reduced motion (static belt, no pause control)", async () => {
    const page = await open(360, "reduce");
    await saveScreenshot(page, "landing-360-reduced-motion");
    await assertResponsive(page, { ...STATIC_CHECKS, label: "landing, reduced motion" });
  });
});
