/**
 * Chart colours (#76): every categorical chart colour reaches 3:1 (WCAG 1.4.11, non-text
 * contrast) against the card it is drawn on, in both themes, and no chart colour equals or sits
 * next to a status colour. Reads the real tokens, so a changed value fails here first.
 * The ratios are recorded in docs/design-system.md.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(import.meta.dirname, "../theme/tokens.css"), "utf8");

type Oklch = [number, number, number];

function block(selector: string): Record<string, Oklch> {
  const start = css.indexOf(`${selector} {`);
  const body = css.slice(start, css.indexOf("}", start));
  const tokens: Record<string, Oklch> = {};
  for (const m of body.matchAll(/--([\w-]+):\s*oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)/g)) {
    tokens[m[1] as string] = [Number(m[2]), Number(m[3]), Number(m[4])];
  }
  return tokens;
}

function toLab([l, c, h]: Oklch): [number, number, number] {
  const rad = (h * Math.PI) / 180;
  return [l, c * Math.cos(rad), c * Math.sin(rad)];
}

/** OKLCH → relative luminance (sRGB, gamut-clipped). */
function luminance(color: Oklch): number {
  const [L, a, b] = toLab(color);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const clip = (x: number) => Math.min(1, Math.max(0, x));
  const r = clip(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s);
  const g = clip(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s);
  const bl = clip(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s);
  return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
}

function contrast(a: Oklch, b: Oklch): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
}

/** Euclidean distance in OKLab (0.02 is about a just-noticeable difference). */
function distance(a: Oklch, b: Oklch): number {
  const [p, q] = [toLab(a), toLab(b)];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

const themes = { light: block(":root"), dark: block(".dark") };
const charts = [1, 2, 3, 4, 5, 6].map((n) => `chart-${n}`);

describe("chart colour contrast (#76)", () => {
  it("contrast math matches WCAG for black on white", () => {
    expect(contrast([1, 0, 0], [0, 0, 0])).toBeCloseTo(21, 1);
  });

  for (const [name, tokens] of Object.entries(themes)) {
    for (const chart of charts) {
      it(`${name}: --${chart} is at least 3:1 against --card`, () => {
        expect(contrast(tokens[chart] as Oklch, tokens.card as Oklch)).toBeGreaterThanOrEqual(3);
      });
    }

    it(`${name}: no chart colour is close to --warning, --success or --destructive`, () => {
      for (const chart of charts) {
        for (const status of ["warning", "success", "destructive"]) {
          expect(
            distance(tokens[chart] as Oklch, tokens[status] as Oklch),
            `--${chart} vs --${status}`,
          ).toBeGreaterThanOrEqual(0.08);
        }
      }
    });
  }

  it("the OS-dark fallback repeats the .dark chart values", () => {
    const media = css.slice(css.indexOf("@media (prefers-color-scheme: dark)"));
    for (const chart of charts) {
      const [l, c, h] = themes.dark[chart] as Oklch;
      expect(media).toContain(`--${chart}: oklch(${l} ${c} ${h});`);
    }
  });
});
