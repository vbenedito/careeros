/**
 * The public landing page against the built dashboard (LAND-01..07, ADR-0009).
 */
import { describe, expect, it } from "vitest";
import { createOAuthUser, dashboardSession, env } from "./helpers";

const DASHBOARD_URL = env("DASHBOARD_URL");
const get = (path: string, cookie?: string) =>
  fetch(`${DASHBOARD_URL}${path}`, { redirect: "manual", headers: cookie ? { cookie } : {} });

describe("landing page (integration)", () => {
  it("LAND-01 LAND-06 signed out: / is the landing page with its own script-free CSP", async () => {
    const res = await get("/");
    expect(res.status).toBe(200);
    const csp = res.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("script-src 'none'");
    expect(csp).toContain("default-src 'none'");
    expect(csp).not.toContain("nonce-");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    const html = await res.text();
    expect(html).toContain("<h1>See where your study time really goes</h1>");
    // No executable script (Web Analytics is off outside Vercel production): only JSON-LD.
    expect(html.match(/<script\b[^>]*>/g)).toEqual(['<script type="application/ld+json">']);
  });

  it("LAND-02 signed in: / goes to /dashboard and keeps the query string", async () => {
    const email = `landing-${Date.now()}@example.test`;
    createOAuthUser(email);
    const { header } = await dashboardSession(email);
    const res = await get("/?view=week&date=2026-11-02", header);
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location") ?? "", DASHBOARD_URL).href).toBe(
      `${DASHBOARD_URL}/dashboard?view=week&date=2026-11-02`,
    );
  });

  it("LAND-07 robots.txt, sitemap.xml and the OG image are public", async () => {
    const robots = await get("/robots.txt");
    expect(robots.status).toBe(200);
    const text = await robots.text();
    expect(text).toContain("Disallow: /api/");
    expect(text).not.toContain("Disallow: /dashboard");
    const sitemap = await get("/sitemap.xml");
    expect(sitemap.status).toBe(200);
    expect(await sitemap.text()).toContain("/privacy</loc>");
    const font = await get("/fonts/mona-sans-latin-wght.woff2");
    expect(font.status).toBe(200);
    const icon = await get("/icon.svg");
    expect(icon.status).toBe(200);
    expect(icon.headers.get("content-type")).toContain("image/svg+xml");
    const og = await get("/opengraph-image");
    expect(og.status).toBe(200);
    expect(og.headers.get("content-type")).toContain("image/png");
  });

  it("LAND-07 app pages are noindex; the privacy page is indexable", async () => {
    expect(await (await get("/sign-in")).text()).toContain(
      'name="robots" content="noindex, nofollow"',
    );
    expect(await (await get("/privacy")).text()).not.toContain("noindex");
  });
});
