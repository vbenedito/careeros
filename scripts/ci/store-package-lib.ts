/**
 * Store package assertions (#156, STORE-01..07, SEC-03/04): pure functions, tested in
 * store-package-lib.test.ts. The expected permission set is written out here on purpose, not
 * imported: changing it must fail this check until the spec (SEC-03) and this file agree.
 */

export const EXPECTED_PERMISSIONS = ["alarms", "idle", "storage", "tabs"];

export interface StoreExpectations {
  /** `version` of apps/extension/package.json. */
  version: string;
  /** Production dashboard origin the build was given (VITE_DASHBOARD_ORIGIN). */
  dashboardOrigin: string;
  /** EXTENSION_PAGES_CSP from manifest.config.ts. */
  csp: string;
}

/** Top-level manifest fields the store package may have (buildManifest() minus `key`). */
export const ALLOWED_TOP_LEVEL = [
  "manifest_version",
  "name",
  "short_name",
  "description",
  "version",
  "minimum_chrome_version",
  "icons",
  "action",
  "background",
  "permissions",
  "externally_connectable",
  "content_security_policy",
];

type Json = Record<string, unknown>;

/** Returns one message per violation; an empty list means the manifest is publishable. */
export function manifestViolations(manifest: Json, expected: StoreExpectations): string[] {
  const v: string[] = [];
  if ("key" in manifest) v.push("manifest has a `key` (the store assigns the ID, STORE-01)");

  const perms = manifest.permissions;
  const sorted = Array.isArray(perms) ? [...perms].map(String).sort() : null;
  if (!sorted || sorted.join(",") !== [...EXPECTED_PERMISSIONS].sort().join(",")) {
    v.push(
      `permissions must be exactly [${EXPECTED_PERMISSIONS.join(", ")}], got ${JSON.stringify(perms)} (SEC-03)`,
    );
  }
  // Exact allow-list: any other top-level field (host_permissions, content_scripts,
  // web_accessible_resources, oauth2, commands, side_panel, …) is a spec change (SEC-03).
  for (const field of Object.keys(manifest)) {
    if (!ALLOWED_TOP_LEVEL.includes(field)) v.push(`manifest declares unexpected field ${field}`);
  }
  const bg = JSON.stringify(manifest.background);
  if (bg !== JSON.stringify({ service_worker: "background.js", type: "module" })) {
    v.push(`background must be exactly the module service worker background.js, got ${bg}`);
  }
  const actionKeys = Object.keys((manifest.action as Json | undefined) ?? {}).sort();
  if (actionKeys.join() !== "default_icon,default_popup,default_title") {
    v.push(`action must only declare default_icon, default_popup, default_title`);
  }

  const matches = (manifest.externally_connectable as Json | undefined)?.matches;
  const want = [`${expected.dashboardOrigin}/*`];
  if (JSON.stringify(matches) !== JSON.stringify(want)) {
    v.push(
      `externally_connectable.matches must be ${JSON.stringify(want)}, got ${JSON.stringify(matches)}`,
    );
  }
  const ec = manifest.externally_connectable as Json | undefined;
  if (ec && Object.keys(ec).some((k) => k !== "matches")) {
    v.push("externally_connectable must only declare `matches`");
  }

  if (manifest.version !== expected.version) {
    v.push(
      `version must be ${expected.version} (apps/extension/package.json), got ${JSON.stringify(manifest.version)}`,
    );
  }
  if (manifest.minimum_chrome_version !== "120") {
    v.push(
      `minimum_chrome_version must be "120", got ${JSON.stringify(manifest.minimum_chrome_version)} (STORE-07)`,
    );
  }
  if (manifest.name !== "CareerOS") {
    v.push(`name must be "CareerOS", got ${JSON.stringify(manifest.name)} (STORE-07)`);
  }
  const csp = (manifest.content_security_policy as Json | undefined)?.extension_pages;
  if (csp !== expected.csp) {
    v.push(
      `content_security_policy.extension_pages must be ${JSON.stringify(expected.csp)}, got ${JSON.stringify(csp)} (SEC-04)`,
    );
  }
  return v;
}

/** Files that must never be in the store package: source maps and environment files. */
export function zipEntryViolations(entries: string[]): string[] {
  const v: string[] = [];
  for (const entry of entries) {
    const base = entry.split("/").pop() ?? entry;
    if (/\.map$/i.test(base)) v.push(`source map in package: ${entry}`);
    if (/^\.env(\..*)?$/.test(base)) v.push(`environment file in package: ${entry}`);
  }
  if (!entries.includes("manifest.json")) v.push("manifest.json missing at the zip root");
  return v;
}
