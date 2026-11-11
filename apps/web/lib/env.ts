/**
 * Environment configuration (ENV-05). Fails fast with a clear message instead of a confusing
 * runtime error deep inside the Supabase client.
 */

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
