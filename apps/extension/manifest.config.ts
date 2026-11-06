/**
 * Builds manifest.json per build mode (ENV-05, AUTH-06, SEC-03, SEC-04).
 *
 * The `key` fields are PUBLIC keys: they pin the extension ID so the dashboard can address it
 * via externally_connectable (AUTH-06). The matching private keys were deliberately not kept —
 * an unpacked extension does not need them (Chrome Web Store publishing would use its own).
 */

export type BuildMode = "development" | "production";

export interface ExtensionBuildConfig {
  /** Origin of the dashboard allowed to message the extension, e.g. "http://localhost:3000". */
  dashboardOrigin: string;
  /** Extension version, from apps/extension/package.json. */
  version: string;
}

export const MANIFEST_KEYS: Record<BuildMode, { key: string; id: string }> = {
  development: {
    key: "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAtUJ+/11+IBazhHs8Z7zlF4p3PJEc1X8VOc5G3rhh1cBoHwz12fNgxhxJiW+ea5+Fj+n5YlNJXEXvCRd1tIOgc2a6p03Y6xlzEPvLhCJOFhkvjKdJJE9frgQ9wolmis0x/XCBbhvz7kg9uL9oRJK+e3kwez+E99eCJzuT1h2+AGQxoIkVnbN9fcxaVHgD/1zqEZCzl+KvpZ1kxSZEJJfM9pGy5q+R5W8jE9d/hds+i+/Kx2vwvyW7X+zP9Q/QutjMny+6ZYsBnU27JsYPuTpFha/ZtENSS/rxIZ2+aMxkLo3cyCA1HQkc6fw97MW8QONT2kmdkraEAajqNyO8guf4hQIDAQAB",
    id: "jfklbpedlpkginmdfckogdgaggmdmkbk",
  },
  production: {
    key: "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAu40eZ45nzjf/knB2oLPaKRrhU3JM9V/V1QS5PsVQiHc/Y0EsHE5Yc+4xLO5VzNKH2M0uZSnLpWTsuJWlXNf2p8Mj5erD4z8jk+RWlKtnDz5ZqITAsg05Ksa6KztgYFpdlq75iukd9TlMDfUsPLcgzvC/XBisOxcsSrdXbtqBv1TRw5FCbHBJb9iG3d0ykNikaTWh+uoh3BTnpskxAXo+V3DuYrPngksDueXGeGaHcoc2vrimwJ5QYVBg9/rO1bsmnIVIxdHL7fiGLU7E20wnbk5pQWfdgiTTPmXL4LlCSf586VKSOrEYrWk/1ZX04y2g22wNXjSuVVqOL6O49Bux9wIDAQAB",
    id: "negamegjachlkaemamlfhaecippkncbl",
  },
};

/** Exact permission set allowed by SEC-03. Anything else is a spec change. */
export const PERMISSIONS = ["alarms", "idle", "storage", "tabs"] as const;

/** MV3 extension-page CSP: no remote code, no eval (SEC-04). */
export const EXTENSION_PAGES_CSP = "script-src 'self'; object-src 'self'";

/** Validates and normalizes the dashboard origin for the given mode. Throws on invalid config. */
export function parseDashboardOrigin(raw: string | undefined, mode: BuildMode): string {
  if (!raw) {
    throw new Error(`VITE_DASHBOARD_ORIGIN is required for ${mode} builds`);
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`VITE_DASHBOARD_ORIGIN is not a valid URL: ${raw}`);
  }
  if (url.origin !== raw.replace(/\/$/, "")) {
    throw new Error(`VITE_DASHBOARD_ORIGIN must be an origin without path: ${raw}`);
  }
  if (mode === "production" && url.protocol !== "https:") {
    throw new Error("VITE_DASHBOARD_ORIGIN must use https in production builds");
  }
  if (mode === "development" && url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Unsupported protocol in VITE_DASHBOARD_ORIGIN: ${url.protocol}`);
  }
  return url.origin;
}

/**
 * VITE_* values are bundled into the extension and therefore public. Refuse obvious secrets
 * (Supabase secret / service-role keys) so they can never ship by mistake (SEC-07).
 */
export function assertNoSecrets(env: Record<string, string | undefined>): void {
  for (const [name, value] of Object.entries(env)) {
    if (!value) continue;
    if (value.startsWith("sb_secret_") || /service_role/i.test(name)) {
      throw new Error(`${name} looks like a server secret and must not be bundled (SEC-07)`);
    }
  }
}

/**
 * Supabase settings bundled into the extension (both public by design, SEC-07). Production
 * builds require both; development builds may omit the key, and the extension then reports
 * itself as not configured instead of failing (CI builds run without a Supabase stack).
 */
export function parseSupabaseConfig(
  env: Record<string, string | undefined>,
  mode: BuildMode,
): { supabaseUrl: string; supabasePublishableKey: string } {
  const supabaseUrl = env.VITE_SUPABASE_URL ?? "";
  const supabasePublishableKey = env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
  if (mode === "production") {
    if (!supabaseUrl.startsWith("https://")) {
      throw new Error("VITE_SUPABASE_URL must be an https URL in production builds");
    }
    if (!supabasePublishableKey) {
      throw new Error("VITE_SUPABASE_PUBLISHABLE_KEY is required for production builds");
    }
  }
  if (supabaseUrl) new URL(supabaseUrl); // throws on an invalid URL
  // Only the publishable key may be bundled; this also rejects legacy JWT keys, where a
  // service_role key would look like any other (SEC-07).
  if (supabasePublishableKey && !supabasePublishableKey.startsWith("sb_publishable_")) {
    throw new Error("VITE_SUPABASE_PUBLISHABLE_KEY must be a publishable key (sb_publishable_…)");
  }
  return { supabaseUrl, supabasePublishableKey };
}

export function buildManifest(mode: BuildMode, config: ExtensionBuildConfig) {
  const name = mode === "production" ? "CareerOS" : "CareerOS (dev)";
  return {
    manifest_version: 3,
    name,
    short_name: "CareerOS",
    description:
      "Tracks time on the study sites you choose. Only hostnames of those sites are recorded.",
    version: config.version,
    key: MANIFEST_KEYS[mode].key,
    minimum_chrome_version: "120",
    action: {
      default_title: name,
      default_popup: "popup.html",
    },
    background: {
      service_worker: "background.js",
      type: "module",
    },
    permissions: [...PERMISSIONS],
    externally_connectable: {
      matches: [`${config.dashboardOrigin}/*`],
    },
    content_security_policy: {
      extension_pages: EXTENSION_PAGES_CSP,
    },
  } as const;
}
