/**
 * Security headers (SEC-09). The CSP uses a per-request nonce (set in proxy.ts), so no inline
 * script runs unless Next.js rendered it for this response.
 */

export interface CspOptions {
  nonce: string;
  isDev: boolean;
  /** Supabase API origin the browser may call (auth, data). */
  supabaseUrl: string;
  /** Only when the site itself is served over https (not for http://localhost builds). */
  upgradeInsecureRequests: boolean;
}

/** OAuth providers the sign-in redirect chain ends at (AUTH-01). */
export const OAUTH_PROVIDER_ORIGINS = [
  "https://accounts.google.com",
  "https://github.com",
] as const;

export function buildCsp({
  nonce,
  isDev,
  supabaseUrl,
  upgradeInsecureRequests,
}: CspOptions): string {
  const supabaseOrigin = new URL(supabaseUrl).origin;
  const directives = [
    "default-src 'self'",
    // 'strict-dynamic' lets nonce'd Next.js bundles load their chunks; dev needs eval for React.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' ${isDev ? "'unsafe-inline'" : `'nonce-${nonce}'`}`,
    // Inline style *attributes* (positioning in Radix popovers, chart sizes) cannot run code;
    // <style> elements still need the nonce.
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    `connect-src 'self' ${supabaseOrigin}`,
    "object-src 'none'",
    "base-uri 'self'",
    // Browsers apply form-action to every redirect after a form POST: the sign-in form posts
    // to /auth/sign-in, which redirects to Supabase /authorize, which redirects to the provider.
    `form-action 'self' ${supabaseOrigin} ${OAUTH_PROVIDER_ORIGINS.join(" ")}`,
    "frame-ancestors 'none'",
  ];
  if (upgradeInsecureRequests) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}

/** Static headers for every response, including API routes (next.config.ts). */
export const STATIC_SECURITY_HEADERS: ReadonlyArray<{ key: string; value: string }> = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

/** HSTS only in production: localhost runs over http. */
export const HSTS_HEADER = {
  key: "Strict-Transport-Security",
  value: "max-age=63072000; includeSubDomains",
};

export function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}
