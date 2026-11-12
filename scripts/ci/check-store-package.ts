/**
 * Store package check (#156, STORE-01..07): builds the production store zip with placeholder
 * PUBLIC values (no secrets, no .env needed) and asserts on the zip's manifest.json and file list.
 *   pnpm check:store-package
 * It overwrites apps/extension/dist/production and careeros-extension-<version>-store.zip (both
 * git-ignored); run `release:store` again before a real release.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { EXTENSION_PAGES_CSP } from "../../apps/extension/manifest.config.ts";
import { manifestViolations, zipEntryViolations } from "./store-package-lib.ts";

const ext = resolve(import.meta.dirname, "../../apps/extension");
const { version } = JSON.parse(readFileSync(resolve(ext, "package.json"), "utf8")) as {
  version: string;
};

// Placeholders: all public by design (SEC-07); process env wins over any local .env.production.
const dashboardOrigin = "https://careeros-taupe.vercel.app";
const env = {
  ...process.env,
  NODE_ENV: "production",
  VITE_DASHBOARD_ORIGIN: dashboardOrigin,
  VITE_SUPABASE_URL: "https://placeholder.supabase.co",
  VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_placeholder",
};
const run = (cmd: string, args: string[]) =>
  execFileSync(cmd, args, { cwd: ext, env, stdio: "inherit" });

const zip = resolve(ext, `careeros-extension-${version}-store.zip`);
rmSync(zip, { force: true });
run("pnpm", ["exec", "vite", "build", "--mode", "production"]);
run("node", ["scripts/zip.ts", "production", "--store"]);

const read = (args: string[]) => execFileSync("unzip", args, { encoding: "utf8" });
const entries = read(["-Z1", zip]).split("\n").filter(Boolean);
const manifest = JSON.parse(read(["-p", zip, "manifest.json"])) as Record<string, unknown>;

const problems = [
  ...manifestViolations(manifest, { version, dashboardOrigin, csp: EXTENSION_PAGES_CSP }),
  ...zipEntryViolations(entries),
];
if (problems.length > 0) {
  console.error(`Store package check failed (${zip}):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.warn(`Store package OK: ${entries.length} files, version ${version}.`);
