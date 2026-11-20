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
 * ENV-05c (#242): the extension version live in the Chrome Web Store (`EXTENSION_STORE_VERSION`,
 * server-only, strict `major.minor.patch`). Missing or empty = null: every gated feature is hidden
 * (safe default). An invalid value throws without echoing it (the production build check reports
 * it earlier). Read on every call, so the server-rendered pages and routes (dynamic) see a changed
 * value after a redeploy and nothing depends on it at build time.
 */
export function extensionStoreVersion(): string | null {
  const raw = process.env.EXTENSION_STORE_VERSION?.trim();
  if (!raw) return null;
  if (!parseExtensionVersion(raw)) {
    throw new Error(
      "Invalid environment variable EXTENSION_STORE_VERSION (see apps/web/.env.example)",
    );
  }
  return raw;
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
