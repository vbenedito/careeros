/**
 * Landing page links from configuration (LAND-05, docs/landing/architecture.md §4): the store
 * listing and the site origin change with configuration only.
 */
export const REPOSITORY_URL = "https://github.com/vbenedito/careeros";

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
