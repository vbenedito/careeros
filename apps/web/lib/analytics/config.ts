/**
 * Vercel Web Analytics switch (SEC-15, ADR-0010). Cookieless page analytics run only on
 * production deployments on Vercel: local dev, tests, CI and preview deployments have none, so
 * they never load the third-party debug script (va.vercel-scripts.com) that the package uses in
 * development, and previews don't spend the plan's event quota.
 */

/** Served by Vercel from our own origin once Web Analytics is enabled for the project. */
export const ANALYTICS_SCRIPT_PATH = "/_vercel/insights/script.js";
/** Where the script sends page views (`/_vercel/insights/view`, …). */
export const ANALYTICS_ENDPOINT_PATH = "/_vercel/insights/";

type Env = Readonly<Record<string, string | undefined>>;

/** `env` is injectable for tests; the default reads the process environment. */
export function isAnalyticsEnabled(env: Env = process.env): boolean {
  return env.VERCEL === "1" && env.VERCEL_ENV === "production";
}
