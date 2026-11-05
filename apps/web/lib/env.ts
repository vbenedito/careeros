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
