/**
 * Regenerates the store images that carry the logo (#229): icon-128.png (96 px artwork inside
 * 16 px transparent padding, per the Chrome Web Store icon guideline) and the mark + wordmark
 * on the two promo tiles and the sidebar logo of screenshot 1 (the old mark and wordmark are covered with the tile background, then
 * the dark lockup from docs/marketing/brand is drawn). Idempotent.
 * Run: node scripts/store-assets.ts (needs Playwright's Chromium).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

const root = resolve(import.meta.dirname, "..", "..", "..");
const assets = resolve(root, "docs", "chrome-web-store", "assets");
const brand = resolve(root, "docs", "marketing", "brand");
const mark = readFileSync(resolve(brand, "careeros-mark.svg"), "utf8");
const lockup = readFileSync(resolve(brand, "careeros-lockup-dark.svg"), "utf8");
const BG = "#0c0d10"; // promo tile background (sampled)

const browser = await chromium.launch();

// Store icon: 128x128, 96x96 artwork centred, transparent padding.
{
  const page = await browser.newPage({ viewport: { width: 128, height: 128 } });
  await page.setContent(
    `<body style="margin:0;background:transparent;width:128px;height:128px;display:grid;place-items:center">${mark.replace("<svg ", '<svg width="96" height="96" ')}</body>`,
  );
  await page.screenshot({ path: resolve(assets, "icon-128.png"), omitBackground: true });
  await page.close();
}

// Promo tiles: [file, width, height, cover rect x/y/w/h, lockup x/y/height].
const tiles = [
  ["promo-small-440x280.png", 440, 280, [28, 60, 156, 44], [32, 64, 36]],
  ["promo-marquee-1400x560.png", 1400, 560, [90, 127, 232, 68], [96, 133, 56]],
  // Dashboard screenshot: only the sidebar logo (top left), on the sidebar colour.
  ["screenshot-1-dashboard-week.png", 1280, 800, [8, 10, 126, 36], [12, 14, 28], "#181d27"],
] as const;
for (const [file, w, h, c, l, bg = BG] of tiles) {
  const png = readFileSync(resolve(assets, file)).toString("base64");
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.setContent(
    `<body style="margin:0;position:relative;width:${w}px;height:${h}px">
<img src="data:image/png;base64,${png}" style="position:absolute;left:0;top:0">
<div style="position:absolute;left:${c[0]}px;top:${c[1]}px;width:${c[2]}px;height:${c[3]}px;background:${bg}"></div>
<div style="position:absolute;left:${l[0]}px;top:${l[1]}px;height:${l[2]}px">${lockup.replace("<svg ", `<svg height="${l[2]}" `)}</div></body>`,
  );
  const shot = await page.screenshot({ path: resolve(assets, file) });
  writeFileSync(resolve(assets, file), shot);
  await page.close();
}
await browser.close();
console.warn("store assets written to docs/chrome-web-store/assets");
