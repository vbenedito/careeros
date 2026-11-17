/**
 * Pure assertion functions of the production smoke check (ENV-12, grill T2). Each returns a list
 * of problems (empty = pass), so `smoke.ts` only does the network I/O and the tests need none.
 * No secrets are involved: the Supabase publishable key is public by design.
 */

export interface SmokeConfig {
  /** The dashboard origin, no trailing slash (e.g. https://careeros-taupe.vercel.app). */
  site: string;
  /** The Chrome Web Store detail URL the landing's "Add to Chrome" must link to. */
  storeUrl: string;
  /** The store extension ID: the last path segment of `storeUrl`. */
  extensionId: string;
  supabaseUrl: string;
  publishableKey: string;
}

/** Headers as a lower-cased name → value map (what `smoke.ts` builds from a fetch Response). */
export type HeaderMap = Readonly<Record<string, string>>;

const EXTENSION_ID = /^[a-p]{32}$/;

/** Validates the repository variables; every problem names the variable to set. */
export function parseConfig(
  env: Readonly<Record<string, string | undefined>>,
): { config: SmokeConfig } | { problems: string[] } {
  const problems: string[] = [];
  const get = (name: string) => (env[name] ?? "").trim();

  const httpsOrigin = (name: string): string => {
    const value = get(name);
    if (!value) {
      problems.push(`${name} is not set (Settings → Secrets and variables → Actions → Variables).`);
      return "";
    }
    try {
      const url = new URL(value);
      if (url.protocol !== "https:") problems.push(`${name} must be an https URL.`);
      return url.origin;
    } catch {
      problems.push(`${name} is not a valid URL.`);
      return "";
    }
  };

  const site = httpsOrigin("SMOKE_SITE_URL");
  const supabaseUrl = httpsOrigin("SMOKE_SUPABASE_URL");
  const publishableKey = get("SMOKE_SUPABASE_PUBLISHABLE_KEY");
  if (!publishableKey) {
    problems.push("SMOKE_SUPABASE_PUBLISHABLE_KEY is not set (the public sb_publishable_… key).");
  } else if (!publishableKey.startsWith("sb_publishable_")) {
    problems.push("SMOKE_SUPABASE_PUBLISHABLE_KEY must be a publishable key (sb_publishable_…).");
  }

  const storeUrl = get("SMOKE_STORE_URL");
  let extensionId = "";
  if (!storeUrl) {
    problems.push("SMOKE_STORE_URL is not set (the Chrome Web Store detail URL).");
  } else {
    const parsed = parseStoreUrl(storeUrl);
    if ("problem" in parsed) problems.push(`SMOKE_STORE_URL ${parsed.problem}`);
    else extensionId = parsed.extensionId;
  }

  if (problems.length > 0) return { problems };
  return { config: { site, storeUrl, extensionId, supabaseUrl, publishableKey } };
}

/** `https://chromewebstore.google.com/detail/<slug>/<id>` (or without the slug). */
export function parseStoreUrl(value: string): { extensionId: string } | { problem: string } {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { problem: "is not a valid URL." };
  }
  if (url.protocol !== "https:" || url.hostname !== "chromewebstore.google.com") {
    return { problem: "must be an https://chromewebstore.google.com/detail/… URL." };
  }
  const parts = url.pathname.split("/").filter(Boolean);
  const id = parts[parts.length - 1] ?? "";
  if (parts[0] !== "detail" || !EXTENSION_ID.test(id)) {
    return { problem: "must end with the 32-letter extension ID (…/detail/<slug>/<id>)." };
  }
  return { extensionId: id };
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/** The `href` of `<link rel="canonical">`, or undefined. */
export function extractCanonical(html: string): string | undefined {
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    if (!/\brel=["']canonical["']/i.test(tag)) continue;
    const href = /\bhref=["']([^"']*)["']/i.exec(tag)?.[1];
    if (href !== undefined) return decodeHtml(href);
  }
  return undefined;
}

/** The `href`s of every anchor whose text is "Add to Chrome". */
export function extractAddToChromeLinks(html: string): string[] {
  const links: string[] = [];
  for (const match of html.matchAll(/<a\b([^>]*)>\s*Add to Chrome\s*<\/a>/gi)) {
    const href = /\bhref=["']([^"']*)["']/i.exec(match[1] ?? "")?.[1];
    links.push(href === undefined ? "" : decodeHtml(href));
  }
  return links;
}

function sameUrl(a: string, b: string): boolean {
  try {
    const x = new URL(a);
    const y = new URL(b);
    return x.origin === y.origin && x.pathname.replace(/\/$/, "") === y.pathname.replace(/\/$/, "");
  } catch {
    return false;
  }
}

export function checkLanding(
  response: { status: number; html: string; headers: HeaderMap },
  config: Pick<SmokeConfig, "site" | "storeUrl">,
): string[] {
  const problems: string[] = [];
  if (response.status !== 200) {
    return [`GET / answered ${response.status}, expected 200.`];
  }
  const canonical = extractCanonical(response.html);
  if (canonical === undefined) {
    problems.push("The landing page has no <link rel=canonical>.");
  } else if (canonical !== `${config.site}/`) {
    problems.push(
      `The landing canonical is ${canonical}, expected ${config.site}/ (SITE_URL / VERCEL_PROJECT_PRODUCTION_URL at build time?).`,
    );
  }
  const links = extractAddToChromeLinks(response.html);
  if (links.length === 0) {
    problems.push('The landing page has no "Add to Chrome" link.');
  }
  for (const href of links) {
    if (!sameUrl(href, config.storeUrl)) {
      problems.push(
        `An "Add to Chrome" link points to ${href || "(empty)"}, expected the store listing ${config.storeUrl} (EXTENSION_INSTALL_URL at build time?).`,
      );
    }
  }
  if (!(response.headers["content-security-policy"] ?? "").trim()) {
    problems.push("The landing response has no Content-Security-Policy header.");
  }
  return problems;
}

export function checkRobots(
  response: { status: number; body: string },
  config: Pick<SmokeConfig, "site">,
): string[] {
  if (response.status !== 200)
    return [`GET /robots.txt answered ${response.status}, expected 200.`];
  const problems: string[] = [];
  if (!response.body.includes(`Sitemap: ${config.site}/sitemap.xml`)) {
    problems.push(`robots.txt does not announce Sitemap: ${config.site}/sitemap.xml.`);
  }
  if (/^\s*disallow:\s*\/\s*$/im.test(response.body)) {
    problems.push("robots.txt disallows the whole site (Disallow: /).");
  }
  return problems;
}

export function checkSitemap(
  response: { status: number; body: string },
  config: Pick<SmokeConfig, "site">,
): string[] {
  if (response.status !== 200) {
    return [`GET /sitemap.xml answered ${response.status}, expected 200.`];
  }
  const problems: string[] = [];
  for (const path of ["/", "/privacy"]) {
    if (!response.body.includes(`<loc>${config.site}${path}</loc>`)) {
      problems.push(`sitemap.xml has no <loc>${config.site}${path}</loc>.`);
    }
  }
  return problems;
}

export function checkPrivacy(response: { status: number }): string[] {
  return response.status === 200 ? [] : [`GET /privacy answered ${response.status}, expected 200.`];
}

/** A signed-out visit to /dashboard must redirect to the sign-in page (AUTH-03). */
export function checkDashboardRedirect(
  response: { status: number; location: string | undefined },
  config: Pick<SmokeConfig, "site">,
): string[] {
  if (response.status < 300 || response.status > 399) {
    return [`GET /dashboard (signed out) answered ${response.status}, expected a redirect.`];
  }
  if (!response.location) return ["The /dashboard redirect has no Location header."];
  let pathname: string;
  try {
    const target = new URL(response.location, config.site);
    if (target.origin !== config.site) {
      return [
        `/dashboard redirects to another origin (${target.origin}), expected ${config.site}.`,
      ];
    }
    pathname = target.pathname;
  } catch {
    return ["The /dashboard redirect Location is not a valid URL."];
  }
  return pathname === "/sign-in"
    ? []
    : [`/dashboard (signed out) redirects to ${pathname}, expected /sign-in.`];
}

function listHas(value: string | undefined, token: string): boolean {
  return (value ?? "")
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .some((part) => part === token.toLowerCase() || part === "*");
}

function allowsOrigin(headers: HeaderMap, origin: string): boolean {
  const allowed = headers["access-control-allow-origin"];
  return allowed === origin || allowed === "*";
}

/** The preflight the extension's browser sends before `ingest_study_sessions` (SYNC-05a). */
export function checkPreflight(
  response: { status: number; headers: HeaderMap },
  origin: string,
): string[] {
  const problems: string[] = [];
  if (response.status < 200 || response.status > 299) {
    problems.push(`The CORS preflight answered ${response.status}, expected 2xx.`);
  }
  if (!allowsOrigin(response.headers, origin)) {
    problems.push(
      `The preflight does not allow the origin ${origin} (Access-Control-Allow-Origin).`,
    );
  }
  if (!listHas(response.headers["access-control-allow-methods"], "POST")) {
    problems.push("The preflight does not allow POST (Access-Control-Allow-Methods).");
  }
  for (const header of ["apikey", "authorization", "content-type"]) {
    if (!listHas(response.headers["access-control-allow-headers"], header)) {
      problems.push(`The preflight does not allow the request header ${header}.`);
    }
  }
  return problems;
}

/**
 * The real call: the extension reads the server clock from `Date` (SYNC-05a), which a browser only
 * exposes to a cross-origin caller when `Access-Control-Expose-Headers` lists it.
 */
export function checkExposeDate(
  response: { status: number; headers: HeaderMap },
  origin: string,
): string[] {
  const problems: string[] = [];
  if (response.status >= 500) {
    problems.push(`The Supabase REST endpoint answered ${response.status}.`);
  }
  if (!allowsOrigin(response.headers, origin)) {
    problems.push(`The REST response does not allow the origin ${origin}.`);
  }
  if (!listHas(response.headers["access-control-expose-headers"], "date")) {
    problems.push(
      "Access-Control-Expose-Headers does not include Date: the extension could not read the server clock (SYNC-05a), so a clock-ahead device would quarantine intervals.",
    );
  }
  if (!response.headers.date) {
    problems.push("The REST response has no Date header.");
  }
  return problems;
}
