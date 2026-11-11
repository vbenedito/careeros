/**
 * Route rules for authentication (AUTH-03). Pure functions so they can be unit-tested.
 */

/** Pages reachable without a session. Everything else requires one. */
export const PUBLIC_PATHS = ["/sign-in", "/auth/callback", "/auth/sign-in", "/privacy"] as const;

/** Public by exact match only (LAND-01, LAND-07): the landing page and its search files. */
export const PUBLIC_EXACT_PATHS = ["/", "/robots.txt", "/sitemap.xml", "/opengraph-image"] as const;

/** Where signed-in visitors land (LAND-02). */
export const DASHBOARD_PATH = "/dashboard";

export function isPublicPath(pathname: string): boolean {
  if ((PUBLIC_EXACT_PATHS as readonly string[]).includes(pathname)) return true;
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export function isApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

/**
 * AUTH-03: only same-origin relative paths are honored as `next` targets, so a crafted link
 * like `/sign-in?next=https://evil.example` can never redirect away after sign-in.
 */
export function safeNextPath(raw: string | null | undefined): string {
  if (!raw?.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return DASHBOARD_PATH;
  // Control characters (tab, newline) are stripped by URL parsers and can hide a second slash.
  // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional control-character check
  if (/[\u0000-\u001f\u007f]/.test(raw)) return DASHBOARD_PATH;
  try {
    // Resolve against a dummy origin: anything that escapes it is rejected.
    const url = new URL(raw, "http://careeros.invalid");
    if (url.origin !== "http://careeros.invalid") return DASHBOARD_PATH;
    // "/" is allowed: the proxy sends a signed-in visitor on to /dashboard with its query.
    if (isPublicPath(url.pathname) && !["/", "/privacy"].includes(url.pathname)) {
      return DASHBOARD_PATH;
    }
    const result = `${url.pathname}${url.search}${url.hash}`;
    // Normalization can turn "/.//evil.com" into "//evil.com" (protocol-relative): re-check.
    if (result.startsWith("//") || result.includes("\\")) return DASHBOARD_PATH;
    return result;
  } catch {
    return DASHBOARD_PATH;
  }
}

export const AUTH_PROVIDERS = ["google", "github"] as const;
export type AuthProvider = (typeof AUTH_PROVIDERS)[number];

export function isAuthProvider(value: unknown): value is AuthProvider {
  return typeof value === "string" && (AUTH_PROVIDERS as readonly string[]).includes(value);
}
