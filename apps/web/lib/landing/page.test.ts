import { describe, expect, it } from "vitest";
import { DESCRIPTION, FAQ, SAMPLE_MONTH, SAMPLE_WEEK, TITLE } from "./content";
import { buildLandingCsp, LANDING_STYLE_HASH } from "./csp";
import { renderLanding } from "./page";

const html = renderLanding({
  siteUrl: "https://careeros.example/",
  installUrl: "https://chromewebstore.google.com/detail/x",
  repositoryUrl: "https://github.com/vbenedito/careeros",
});

describe("landing page (LAND)", () => {
  it("LAND-04 SEO basics: title ≤ 60, description ≤ 155, one h1, canonical, lang", () => {
    expect(TITLE.length).toBeLessThanOrEqual(60);
    expect(DESCRIPTION.length).toBeLessThanOrEqual(155);
    expect(html).toContain(`<title>${TITLE}</title>`);
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toContain('<link rel="canonical" href="https://careeros.example/">');
    expect(html).toContain('<html lang="en">');
    expect(html.toLowerCase()).toContain("study time tracker");
  });

  it("LAND-04 JSON-LD is valid JSON, BrowserApplication, free, no ratings", () => {
    const raw = /<script type="application\/ld\+json">(.*?)<\/script>/s.exec(html)?.[1] ?? "";
    const data = JSON.parse(raw) as Array<Record<string, unknown>>;
    const app = data.find((d) => d["@type"] === "SoftwareApplication");
    expect(app?.applicationCategory).toBe("BrowserApplication");
    expect(app).not.toHaveProperty("aggregateRating");
    expect(JSON.stringify(app?.offers)).toContain('"price":"0"');
  });

  it("LAND-06 no executable script, no event handlers, only the JSON-LD data block", () => {
    expect(html.match(/<script\b[^>]*>/g)).toEqual(['<script type="application/ld+json">']);
    expect(html).not.toMatch(/\son[a-z]+=/i);
    expect(html).not.toContain("javascript:");
  });

  it("LAND-06 the CSP allows exactly the inline stylesheet, by hash, and no scripts", () => {
    const csp = buildLandingCsp(true);
    expect(csp).toContain("script-src 'none'");
    expect(csp).toContain(`style-src '${LANDING_STYLE_HASH}'`);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("upgrade-insecure-requests");
    expect(buildLandingCsp(false)).not.toContain("upgrade-insecure-requests");
  });

  it("LAND-05 CTAs: sign-in and the configured store link", () => {
    expect(html).toContain('href="/sign-in">Get started — it\'s free</a>');
    expect(html).toContain('href="https://chromewebstore.google.com/detail/x">Add to Chrome</a>');
  });

  it("LAND-03 the FAQ on the page is the FAQ content; sample totals add up", () => {
    for (const f of FAQ) expect(html).toContain(f.q.replaceAll("'", "&#39;"));
    const total = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
    expect(total(SAMPLE_WEEK)).toBe(400); // 6h 40m
    expect(total(SAMPLE_MONTH)).toBe(1370); // 22h 50m
    expect(html).toContain("6h 40m");
    expect(html).toContain("22h 50m");
  });

  it("LAND-08 interactions are native controls with labels; motion respects reduced motion", () => {
    for (const id of ["away", "c-lc", "c-nc", "c-py", "c-yt", "v-week", "v-month"]) {
      expect(html).toContain(`id="${id}"`);
    }
    for (const id of ["away", "c-lc", "v-month"]) expect(html).toContain(`<label for="${id}"`);
    expect(html).toContain("@media (prefers-reduced-motion:no-preference)");
  });
});
