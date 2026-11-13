import { describe, expect, it } from "vitest";
import {
  checkDashboardRedirect,
  checkExposeDate,
  checkLanding,
  checkPreflight,
  checkPrivacy,
  checkRobots,
  checkSitemap,
  extractAddToChromeLinks,
  extractCanonical,
  parseConfig,
  parseStoreUrl,
} from "./smoke-lib.ts";

const ID = "pddbflgidjmnhidineoejneeipaicgek";
const site = "https://careeros.example";
const storeUrl = `https://chromewebstore.google.com/detail/careeros/${ID}`;
const config = { site, storeUrl };
const origin = `chrome-extension://${ID}`;

const landing = (over: { canonical?: string; href?: string } = {}) =>
  `<html><head><link rel="canonical" href="${over.canonical ?? `${site}/`}"></head><body>` +
  `<a class="btn" href="/sign-in">Get started</a>` +
  `<a class="btn btn-ghost" href="${over.href ?? storeUrl}">Add to Chrome</a></body></html>`;
const okHeaders = { "content-security-policy": "default-src 'self'" };

describe("ENV-12 smoke: configuration", () => {
  const env = {
    SMOKE_SITE_URL: `${site}/`,
    SMOKE_STORE_URL: storeUrl,
    SMOKE_SUPABASE_URL: "https://abc.supabase.co",
    SMOKE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x",
  };

  it("ENV-12 accepts the four variables and derives the extension ID from the store URL", () => {
    const parsed = parseConfig(env);
    expect(parsed).toEqual({
      config: {
        site,
        storeUrl,
        extensionId: ID,
        supabaseUrl: "https://abc.supabase.co",
        publishableKey: "sb_publishable_x",
      },
    });
  });

  it("ENV-12 names every missing or wrong variable", () => {
    const parsed = parseConfig({ SMOKE_SITE_URL: "http://insecure.example" });
    const problems = "problems" in parsed ? parsed.problems.join("\n") : "";
    expect(problems).toContain("SMOKE_SITE_URL must be an https URL");
    expect(problems).toContain("SMOKE_STORE_URL is not set");
    expect(problems).toContain("SMOKE_SUPABASE_URL is not set");
    expect(problems).toContain("SMOKE_SUPABASE_PUBLISHABLE_KEY is not set");
  });

  it("ENV-12 refuses a secret-looking key in place of the publishable key", () => {
    const parsed = parseConfig({ ...env, SMOKE_SUPABASE_PUBLISHABLE_KEY: "sb_secret_oops" });
    expect("problems" in parsed && parsed.problems[0]).toContain("publishable key");
  });

  it("ENV-12 the store URL must be a Chrome Web Store detail URL with a 32-letter ID", () => {
    expect(parseStoreUrl(storeUrl)).toEqual({ extensionId: ID });
    expect(parseStoreUrl(`https://chromewebstore.google.com/detail/${ID}`)).toEqual({
      extensionId: ID,
    });
    expect("problem" in parseStoreUrl("https://chromewebstore.google.com/search/CareerOS")).toBe(
      true,
    );
    expect("problem" in parseStoreUrl(`https://example.com/detail/x/${ID}`)).toBe(true);
    expect("problem" in parseStoreUrl("not a url")).toBe(true);
  });
});

describe("ENV-12 smoke: landing page", () => {
  it("ENV-12 passes with the canonical, the store link and a CSP header", () => {
    expect(checkLanding({ status: 200, html: landing(), headers: okHeaders }, config)).toEqual([]);
  });

  it("ENV-12 reads the canonical and decodes HTML entities in links", () => {
    expect(extractCanonical(landing({ canonical: "https://x.example/?a=1&amp;b=2" }))).toBe(
      "https://x.example/?a=1&b=2",
    );
    expect(extractCanonical("<html></html>")).toBeUndefined();
    expect(extractAddToChromeLinks(landing({ href: "https://s.example/?a=1&amp;b=2" }))).toEqual([
      "https://s.example/?a=1&b=2",
    ]);
  });

  it("ENV-12 fails on a non-200 status", () => {
    expect(checkLanding({ status: 500, html: "", headers: okHeaders }, config)).toEqual([
      "GET / answered 500, expected 200.",
    ]);
  });

  it("ENV-12 fails when the canonical is another origin (build-time SITE_URL wrong)", () => {
    const problems = checkLanding(
      {
        status: 200,
        html: landing({ canonical: "https://careeros-abc.vercel.app/" }),
        headers: okHeaders,
      },
      config,
    );
    expect(problems.join()).toContain("canonical is https://careeros-abc.vercel.app/");
  });

  it("ENV-12 fails when Add to Chrome points to the store search instead of the listing", () => {
    const problems = checkLanding(
      {
        status: 200,
        html: landing({ href: "https://chromewebstore.google.com/search/CareerOS" }),
        headers: okHeaders,
      },
      config,
    );
    expect(problems.join()).toContain("expected the store listing");
  });

  it("ENV-12 fails when the link is missing, or the CSP header is", () => {
    const problems = checkLanding({ status: 200, html: "<html></html>", headers: {} }, config);
    expect(problems).toHaveLength(3);
  });

  it("ENV-12 accepts a trailing-slash difference in the store URL", () => {
    expect(
      checkLanding(
        { status: 200, html: landing({ href: `${storeUrl}/` }), headers: okHeaders },
        config,
      ),
    ).toEqual([]);
  });
});

describe("ENV-12 smoke: crawl files and routes", () => {
  it("ENV-12 robots.txt announces the sitemap and does not block the site", () => {
    const body = `User-Agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${site}/sitemap.xml\n`;
    expect(checkRobots({ status: 200, body }, config)).toEqual([]);
    expect(checkRobots({ status: 404, body: "" }, config)).toHaveLength(1);
    expect(checkRobots({ status: 200, body: "User-Agent: *\nDisallow: /\n" }, config)).toHaveLength(
      2,
    );
    expect(
      checkRobots({ status: 200, body: `Sitemap: https://other.example/sitemap.xml` }, config),
    ).toHaveLength(1);
  });

  it("ENV-12 sitemap.xml lists / and /privacy on the site origin", () => {
    const body = `<urlset><url><loc>${site}/</loc></url><url><loc>${site}/privacy</loc></url></urlset>`;
    expect(checkSitemap({ status: 200, body }, config)).toEqual([]);
    expect(
      checkSitemap(
        { status: 200, body: `<urlset><url><loc>${site}/</loc></url></urlset>` },
        config,
      ),
    ).toHaveLength(1);
    expect(checkSitemap({ status: 500, body: "" }, config)).toHaveLength(1);
  });

  it("ENV-12 /privacy must answer 200", () => {
    expect(checkPrivacy({ status: 200 })).toEqual([]);
    expect(checkPrivacy({ status: 404 })).toHaveLength(1);
  });

  it("ENV-12 signed-out /dashboard redirects to /sign-in on the site", () => {
    expect(checkDashboardRedirect({ status: 307, location: `${site}/sign-in` }, config)).toEqual(
      [],
    );
    expect(
      checkDashboardRedirect({ status: 307, location: "/sign-in?next=%2Fdashboard" }, config),
    ).toEqual([]);
    expect(checkDashboardRedirect({ status: 200, location: undefined }, config)).toHaveLength(1);
    expect(checkDashboardRedirect({ status: 307, location: undefined }, config)).toHaveLength(1);
    expect(checkDashboardRedirect({ status: 307, location: `${site}/` }, config)).toHaveLength(1);
    expect(
      checkDashboardRedirect({ status: 307, location: "https://evil.example/sign-in" }, config),
    ).toHaveLength(1);
  });
});

describe("ENV-12 smoke: Supabase CORS from the extension origin", () => {
  const preflight = {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "access-control-allow-headers": "Authorization, Content-Type, apikey, X-Client-Info",
  };

  it("ENV-12 passes a preflight that allows the origin, POST and the three headers", () => {
    expect(checkPreflight({ status: 200, headers: preflight }, origin)).toEqual([]);
    expect(
      checkPreflight(
        { status: 204, headers: { ...preflight, "access-control-allow-origin": origin } },
        origin,
      ),
    ).toEqual([]);
  });

  it("ENV-12 fails a preflight for another origin, a missing method or header", () => {
    expect(
      checkPreflight(
        {
          status: 200,
          headers: { ...preflight, "access-control-allow-origin": "https://x.example" },
        },
        origin,
      ),
    ).toHaveLength(1);
    expect(
      checkPreflight(
        { status: 200, headers: { ...preflight, "access-control-allow-methods": "GET" } },
        origin,
      ),
    ).toHaveLength(1);
    expect(
      checkPreflight(
        { status: 200, headers: { ...preflight, "access-control-allow-headers": "apikey" } },
        origin,
      ),
    ).toHaveLength(2);
    expect(checkPreflight({ status: 403, headers: preflight }, origin).length).toBeGreaterThan(0);
  });

  const real = {
    "access-control-allow-origin": "*",
    "access-control-expose-headers":
      "Content-Encoding, Content-Location, Content-Range, Content-Type, Date, Location, Server, Transfer-Encoding, Range-Unit",
    date: "Fri, 13 Nov 2026 10:00:00 GMT",
  };

  it("ENV-12 SYNC-05a passes when Date is exposed, whatever the (anonymous) status", () => {
    expect(checkExposeDate({ status: 401, headers: real }, origin)).toEqual([]);
    expect(checkExposeDate({ status: 200, headers: real }, origin)).toEqual([]);
  });

  it("ENV-12 SYNC-05a fails when Access-Control-Expose-Headers lacks Date", () => {
    const problems = checkExposeDate(
      { status: 200, headers: { ...real, "access-control-expose-headers": "Content-Type" } },
      origin,
    );
    expect(problems.join()).toContain("does not include Date");
  });

  it("ENV-12 fails on a server error, a missing Date or a blocked origin", () => {
    expect(checkExposeDate({ status: 503, headers: real }, origin)).toHaveLength(1);
    expect(checkExposeDate({ status: 200, headers: { ...real, date: "" } }, origin)).toHaveLength(
      1,
    );
    expect(checkExposeDate({ status: 200, headers: {} }, origin).length).toBeGreaterThanOrEqual(2);
  });
});
