import { readFileSync } from "node:fs";
import { ENTITLEMENTS } from "@careeros/shared";
import { describe, expect, it } from "vitest";
import {
  DESCRIPTION,
  FAQ,
  REMEMBERED_WEEK,
  SAMPLE_MONTH,
  SAMPLE_WEEK,
  STUDY_HOURS,
  TITLE,
} from "./content";
import { buildLandingCsp, LANDING_STYLE_HASH } from "./csp";
import { renderLanding } from "./page";

const html = renderLanding({
  siteUrl: "https://careeros.example/",
  installUrl: "https://chromewebstore.google.com/detail/x",
  repositoryUrl: "https://github.com/vbenedito/careeros",
  problemTracking: true,
});

describe("landing page (LAND)", () => {
  it("LAND-09 the Search Console meta tag appears only when configured", () => {
    expect(html).not.toContain("google-site-verification");
    const verified = renderLanding({
      siteUrl: "https://careeros.example/",
      installUrl: "https://chromewebstore.google.com/detail/x",
      repositoryUrl: "https://github.com/vbenedito/careeros",
      googleSiteVerification: "abcDEF123_-abcDEF123_-xyz",
    });
    expect(verified).toContain(
      '<meta name="google-site-verification" content="abcDEF123_-abcDEF123_-xyz">',
    );
  });

  it("LAND-04 SEO basics: title ≤ 60, description ≤ 155, one h1, canonical, lang", () => {
    expect(TITLE.length).toBeLessThanOrEqual(60);
    expect(DESCRIPTION.length).toBeLessThanOrEqual(155);
    expect(html).toContain(`<title>${TITLE}</title>`);
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toContain('<link rel="canonical" href="https://careeros.example/">');
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('<link rel="icon" href="/icon.svg" type="image/svg+xml">');
    expect(html).toMatch(
      /<a class="brand" href="\/"><svg class="mark" aria-hidden="true"[^>]*>.*<\/svg><span>Career<span class="os">OS<\/span><\/span><\/a>/,
    );
    expect(html).toContain('<link rel="apple-touch-icon" href="/apple-icon.png">');
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

  it("LAND-06 SEC-15 the analytics script appears only when enabled, and no inline script", () => {
    const withAnalytics = renderLanding({
      siteUrl: "https://careeros.example/",
      installUrl: "https://chromewebstore.google.com/detail/x",
      repositoryUrl: "https://github.com/vbenedito/careeros",
      analytics: true,
    });
    expect(withAnalytics.match(/<script\b[^>]*>/g)).toEqual([
      '<script type="application/ld+json">',
      '<script defer src="/_vercel/insights/script.js">',
    ]);
    expect(withAnalytics).toContain('<script defer src="/_vercel/insights/script.js"></script>');
    expect(html).not.toContain("_vercel");
  });

  it("LAND-03 sections in order, one h1, the h2 list", () => {
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    const h2s = [...html.matchAll(/<h2>(.*?)<\/h2>/g)].map((m) => m[1]);
    expect(h2s).toEqual([
      "How many hours did you study last week?",
      "Stop starting timers",
      "Stop counting the scroll as study",
      "See the week you really had",
      "How the study time tracker works",
      "How many hours should you study for coding interviews?",
      "The rules, exactly",
      "Questions",
      "Start measuring this week's study",
    ]);
    expect(html.indexOf('id="how"')).toBeLessThan(html.indexOf('id="study-hours"'));
    expect(html.indexOf('id="study-hours"')).toBeLessThan(html.indexOf("The rules, exactly"));
  });

  it("LAND-03 #140 the privacy section is gone; Privacy links go to /privacy", () => {
    expect(html).not.toContain('id="privacy"');
    expect(html).not.toContain('href="#privacy"');
    expect(html).not.toContain("Don&#39;t trade your privacy");
    expect(html.match(/href="\/privacy">Privacy<\/a>/g)).toHaveLength(2); // header and footer
  });

  it("LAND-03 #196 no privacy badge row; FAQ names the opt-in LeetCode problem name; no cookie claim", () => {
    expect(html).not.toContain('class="wrap badges"');
    expect(html).not.toContain("No URLs stored");
    expect(html).toContain(
      "if you turn on Track LeetCode problems, it also keeps the problem name",
    );
    expect(html).toContain("By default, only the site and the start and end times are saved.");
    expect(html.toLowerCase()).not.toContain("cookie");
  });

  it("PRB-23 LAND-03 without problem tracking in the store, FAQ 1 and the demo label read as before #226", () => {
    const before = renderLanding({
      siteUrl: "https://careeros.example/",
      installUrl: "https://chromewebstore.google.com/detail/x",
      repositoryUrl: "https://github.com/vbenedito/careeros",
    });
    expect(before).not.toContain("Track LeetCode problems");
    expect(before).not.toContain("One exception");
    expect(before).not.toContain("By default, only");
    expect(before).toContain("Only the site and the start and end times are saved.");
    expect(before).toContain("never reads page titles or content. Because of this, Chrome");
  });

  it("PRB-22 LAND-03 store 0.3.1: FAQ 1 names Track coding problems and both sites; 0.3.0 stays LeetCode-only", () => {
    const base = {
      siteUrl: "https://careeros.example/",
      installUrl: "https://chromewebstore.google.com/detail/x",
      repositoryUrl: "https://github.com/vbenedito/careeros",
      problemTracking: true,
    };
    const v030 = renderLanding(base);
    const v031 = renderLanding({ ...base, problemTrackingNeetCode: true });
    expect(v031).toContain(
      "if you turn on Track coding problems, it also keeps the problem name from a LeetCode or NeetCode address (for example two-sum).",
    );
    expect(v031).not.toContain("Track LeetCode problems");
    expect(v031).toContain("By default, only the site and the start and end times are saved.");
    expect(v030).toContain(
      "if you turn on Track LeetCode problems, it also keeps the problem name from a LeetCode address",
    );
    expect(v030).not.toContain("Track coding problems");
    // The NeetCode flag alone, without problem tracking, changes nothing (unset store).
    const unset = renderLanding({ ...base, problemTracking: false, problemTrackingNeetCode: true });
    expect(unset).not.toContain("One exception");
  });

  it("PSR-18 PSR-21 LAND-03 store 0.4.0: FAQ 1 adds the sites the user adds; before it, the 0.3.1 text", () => {
    const base = {
      siteUrl: "https://careeros.example/",
      installUrl: "https://chromewebstore.google.com/detail/x",
      repositoryUrl: "https://github.com/vbenedito/careeros",
      problemTracking: true,
      problemTrackingNeetCode: true,
    };
    const v040 = renderLanding({ ...base, problemRules: true });
    expect(v040).toContain("and the problem id from the problem sites you add.");
    expect(renderLanding(base)).not.toContain("problem sites you add");
    expect(renderLanding({ ...base, problemTracking: false, problemRules: true })).not.toContain(
      "One exception",
    );
  });

  it("LAND-03 #140 the study-hours section: honest copy, example data clearly labelled", () => {
    for (const p of STUDY_HOURS.points) expect(html).toContain(`<h3>${p.t}</h3>`);
    expect(html).toContain("There&#39;s no magic number.");
    expect(html).toContain("Example data, not from real users.");
    const total = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
    expect(total(REMEMBERED_WEEK)).toBe(600); // 10h 00m
    expect(total(REMEMBERED_WEEK)).toBeGreaterThan(total(SAMPLE_WEEK));
    expect(html).toContain("an invented guess at the week, 10h&#160;00m");
    expect(html).toContain("the same sample week as counted, 6h&#160;40m");
    expect(html).not.toMatch(/goal|target|last week&#39;s|vs\. last/i);
  });

  it("LAND-06 the CSP allows exactly the inline stylesheet, by hash, and no scripts", () => {
    const csp = buildLandingCsp(true);
    expect(csp).toContain("script-src 'none'");
    expect(csp).not.toContain("connect-src");
    expect(csp).toContain(`style-src '${LANDING_STYLE_HASH}'`);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("font-src 'self'");
    expect(csp).toContain("upgrade-insecure-requests");
    expect(buildLandingCsp(false)).not.toContain("upgrade-insecure-requests");
  });

  it("LAND-06 the CSP hash matches the <style> actually served", async () => {
    const { createHash } = await import("node:crypto");
    const styles = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1] ?? "");
    expect(styles).toHaveLength(1);
    const hash = `sha256-${createHash("sha256")
      .update(styles[0] ?? "")
      .digest("base64")}`;
    expect(hash).toBe(LANDING_STYLE_HASH);
  });

  it("LAND-03 the engine log and the site belt show real rules, sample times only", async () => {
    const { ENGINE_LOG } = await import("./content");
    for (const l of ENGINE_LOG) expect(html).toContain(l.result);
    expect(html).toContain("no input for 60 s");
    // TRK-08: no saved interval is longer than MAX_INTERVAL_S (30 min).
    const closed = ENGINE_LOG.find((l) => l.result.startsWith("session closed"));
    expect(Number(/(\d+)m/.exec(closed?.result ?? "")?.[1])).toBeLessThanOrEqual(30);
    expect(html).toContain('"started_at": "09:20:02", "ended_at": "09:46:10"');
    expect(html).toContain("Examples. Any site you study on works; you choose.");
  });

  it("LAND-08 visitors can pause all motion", () => {
    expect(html).toContain('<label for="pause" class="chip">Pause animations</label>');
    expect(html).toContain("#pause:checked~main *");
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
    const ids = [...html.matchAll(/<input type="(?:checkbox|radio)"[^>]*\bid="([^"]+)"/g)].map(
      (m) => m[1],
    );
    expect(ids).toEqual([
      "pause",
      "away",
      "c-lc",
      "c-nc",
      "c-py",
      "c-yt",
      "v-week",
      "v-month",
      "r-remembered",
      "r-measured",
    ]);
    for (const id of ids) expect(html).toContain(`<label for="${id}"`);
    expect(html).toContain('<label for="r-remembered" class="chip">Remembered</label>');
    expect(html).toContain('<label for="r-measured" class="chip">Measured</label>');
    expect(html).toContain("@media (prefers-reduced-motion:no-preference)");
  });

  it("LAND-06 SEC-15 with analytics: exactly the script URL and the insights endpoint", () => {
    const csp = buildLandingCsp(true, "https://careeros.example/any/path");
    const directives = csp.split("; ");
    expect(directives).toContain("script-src https://careeros.example/_vercel/insights/script.js");
    expect(directives).toContain("connect-src https://careeros.example/_vercel/insights/");
    expect(directives).toContain("default-src 'none'");
    expect(directives).toContain(`style-src '${LANDING_STYLE_HASH}'`);
    const scriptSrc = directives.find((d) => d.startsWith("script-src")) ?? "";
    expect(scriptSrc).not.toContain("unsafe");
    expect(scriptSrc).not.toContain("'self'");
    // Same policy otherwise.
    expect(directives.filter((d) => !/^(script|connect)-src/.test(d))).toEqual(
      buildLandingCsp(true)
        .split("; ")
        .filter((d) => !d.startsWith("script-src")),
    );
  });
});

describe("landing limit numbers (ENT-10)", () => {
  const limit = ENTITLEMENTS.FREE_MAX_TRACKED_DOMAINS;
  const source = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");
  /** The source without comments and without CSS numbers like `0.12`. */
  const code = (file: string) =>
    source(file)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");

  it("ENT-10 the landing content file has no literal 12 for the site limit", () => {
    expect(code("./content.ts")).not.toMatch(/(?<![\d.])12(?![\d.])/);
  });

  it("ENT-10 the landing page file does not type the site limit either", () => {
    expect(code("./page.ts")).not.toMatch(/up to \d+ sites/);
  });

  it("ENT-10 the rules in numbers and the FAQ show the number from ENTITLEMENTS", () => {
    expect(html).toContain(`<dt>${limit}</dt><dd>study sites per account`);
    expect(html).toContain(`Any site you add, up to ${limit}.`);
    expect(html).toContain(`up to ${limit} sites, subdomains included`);
  });
});
