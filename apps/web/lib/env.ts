/**
 * Environment configuration (ENV-05). Fails fast with a clear message instead of a confusing
 * runtime error deep inside the Supabase client.
 */

import {
  type ExtensionFeature,
  isExtensionFeatureLive,
  parseExtensionVersion,
} from "@careeros/shared";

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing environment variable ${name} (see apps/web/.env.example)`);
  }
  return value;
}

/** Public values: safe in the browser (RLS protects the data). */
export function publicEnv() {
  return {
    supabaseUrl: required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    supabasePublishableKey: required(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    ),
  };
}

/**
 * The dashboard's own origin, used for OAuth redirects and Origin checks (SEC-08). Taken from
 * configuration, never from the request's Host header, so it cannot be spoofed.
 */
export function siteUrl(): string {
  return new URL(required("SITE_URL", process.env.SITE_URL)).origin;
}

/** ID of the extension build this dashboard talks to (AUTH-06). Public by design. */
export function extensionId(): string {
  return required("NEXT_PUBLIC_EXTENSION_ID", process.env.NEXT_PUBLIC_EXTENSION_ID);
}

/**
 * Publication details for /privacy (SEC-13). Optional so local and CI builds work; set in
 * production (#31). Missing values render as a visible "not configured" marker.
 */
export function privacyConfig() {
  const value = (name: string) => process.env[name]?.trim() || null;
  return {
    controller: value("PRIVACY_CONTROLLER"),
    contactEmail: value("PRIVACY_CONTACT_EMAIL"),
    dataRegion: value("DATA_REGION"),
  };
}

/**
 * Read-only token for the private ledger repository (ADM-08). Server-only: it has no
 * `NEXT_PUBLIC_` twin and must never be logged or passed to a client component. Optional:
 * without it the admin page says "Ledger unavailable".
 */
export function opsLedgerToken(): string | null {
  return process.env.OPS_LEDGER_TOKEN?.trim() || null;
}

/**
 * Test-only (TEST-01, #232): the base URL of the GitHub REST API the admin page reads. It is the
 * real `https://api.github.com` unless the CI-only variable `OPS_GITHUB_API_STUB` names a local
 * stub server, and the stub is used only when ALL of these hold: the variable is set, `CI` is set, the code
 * does not run on Vercel (`VERCEL_ENV` is set on every Vercel build and runtime, so never in
 * production or preview), and the URL is plain `http://127.0.0.1:<port>` (the token can only go
 * to the same machine). Anything else falls back to GitHub. The production build check also
 * fails when the variable exists (`productionEnvProblems`).
 */
export function githubApiBase(fallback: string): string {
  const stub = process.env.OPS_GITHUB_API_STUB?.trim();
  if (!stub || !process.env.CI || process.env.VERCEL_ENV) return fallback;
  try {
    const url = new URL(stub);
    if (url.protocol === "http:" && url.hostname === "127.0.0.1" && url.port !== "") {
      return url.origin;
    }
  } catch {
    // Not a URL: ignored.
  }
  return fallback;
}

/**
 * ENV-05c (#242): the extension version live in the Chrome Web Store (`EXTENSION_STORE_VERSION`,
 * server-only, strict `major.minor.patch`). Missing, empty or invalid = null: every gated feature
 * is hidden (safe default). An invalid value never breaks a request and is never echoed or logged
 * (the production build check fails on it, so it only reaches here in preview and local runs).
 * Read on every call, so the server-rendered pages and routes (dynamic) see a changed value after
 * a redeploy; static pages (landing, privacy) read it at build time.
 */
export function extensionStoreVersion(): string | null {
  const raw = process.env.EXTENSION_STORE_VERSION?.trim();
  return raw && parseExtensionVersion(raw) ? raw : null;
}

/** ENV-05c: is a dashboard feature that needs a newer extension live for store users? */
export function extensionFeatureLive(feature: ExtensionFeature): boolean {
  return isExtensionFeatureLive(feature, extensionStoreVersion());
}

/**
 * Origin for pages built at build time (landing, robots, sitemap: LAND-04/07), where SITE_URL
 * may be absent (CI builds, preview deployments). Falls back to Vercel's production domain,
 * then localhost. Never used for security decisions: those use siteUrl().
 */
export function buildSiteUrl(): string {
  const configured = process.env.SITE_URL?.trim();
  if (configured) return new URL(configured).origin;
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return new URL(`https://${vercel}`).origin;
  return "http://localhost:3000";
}
