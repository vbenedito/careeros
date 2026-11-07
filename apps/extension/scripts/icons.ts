/**
 * Renders scripts/icon.svg to the PNG sizes Chrome uses (16/32/48/128) in public/icons.
 * Run when the icon changes: node scripts/icons.ts (needs Playwright's Chromium).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

const svg = readFileSync(resolve(import.meta.dirname, "icon.svg"), "utf8");
const browser = await chromium.launch();
for (const size of [16, 32, 48, 128]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(
    `<body style="margin:0;background:transparent">${svg.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body>`,
  );
  await page.screenshot({
    path: resolve(import.meta.dirname, "..", "public", "icons", `icon-${size}.png`),
    omitBackground: true,
  });
  await page.close();
}
await browser.close();
console.warn("icons written to public/icons");
