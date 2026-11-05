/**
 * Route rules for authentication (AUTH-03). Pure functions so they can be unit-tested.
 */

/** Pages reachable without a session. Everything else requires one. */
export const PUBLIC_PATHS = ["/sign-in", "/auth/callback", "/auth/sign-in", "/privacy"] as const;

export function isPublicPath(pathname: string): boolean {
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
  if (!raw?.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return "/";
  try {
    // Resolve against a dummy origin: anything that escapes it is rejected.
    const url = new URL(raw, "http://careeros.invalid");
    if (url.origin !== "http://careeros.invalid") return "/";
    if (isPublicPath(url.pathname) && url.pathname !== "/privacy") return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}

export const AUTH_PROVIDERS = ["google", "github"] as const;
export type AuthProvider = (typeof AUTH_PROVIDERS)[number];

export function isAuthProvider(value: unknown): value is AuthProvider {
  return typeof value === "string" && (AUTH_PROVIDERS as readonly string[]).includes(value);
}
