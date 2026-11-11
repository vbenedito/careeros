/**
 * Landing page links from configuration (LAND-05, docs/history/landing/architecture.md §4): the store
 * listing and the site origin change with configuration only.
 */
export const REPOSITORY_URL = "https://github.com/vbenedito/careeros";

/**
 * Google Search Console ownership token (LAND-09), from GOOGLE_SITE_VERIFICATION. Optional; the
 * value is public (it is printed in the page). Only Google's token characters are accepted, so a
 * bad value fails the build instead of reaching the HTML.
 */
export function siteVerificationToken(): string | undefined {
  const value = process.env.GOOGLE_SITE_VERIFICATION?.trim();
  if (!value) return undefined;
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(value)) {
    throw new Error("GOOGLE_SITE_VERIFICATION must be the content value of Google's meta tag");
  }
  return value;
}

/** The Chrome Web Store listing; until it is set, the store search for CareerOS. */
export function extensionInstallUrl(): string {
  const value = process.env.EXTENSION_INSTALL_URL?.trim();
  if (value) {
    const url = new URL(value);
    if (url.protocol !== "https:") throw new Error("EXTENSION_INSTALL_URL must be https");
    return url.toString();
  }
  return "https://chromewebstore.google.com/search/CareerOS";
}
