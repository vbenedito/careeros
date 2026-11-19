/**
 * Renders the CareerOS logo mark (direction C, #229) to the PNG sizes Chrome uses (16/32/48/128)
 * in public/icons. Small cut (icon-small.svg) at 16 and 32 px, standard cut (icon.svg) from 48 px,
 * as in docs/marketing/brand/README.md. Light variant (navy tile): the toolbar cannot follow the theme.
 * Run when the icon changes: node scripts/icons.ts (needs Playwright's Chromium).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

const read = (name: string) => readFileSync(resolve(import.meta.dirname, name), "utf8");
const standard = read("icon.svg");
const small = read("icon-small.svg");
const browser = await chromium.launch();
for (const size of [16, 32, 48, 128]) {
  const svg = size < 48 ? small : standard;
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
