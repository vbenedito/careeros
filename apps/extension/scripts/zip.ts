/**
 * Packages a built extension into a release zip (ENV-05a):
 *   pnpm --filter @careeros/extension release   → careeros-extension-<version>.zip (production)
 * Uses the system `zip` (available on macOS and GitHub's Ubuntu runners).
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const mode = process.argv[2] ?? "production";
const dist = resolve(root, "dist", mode);
const manifestPath = resolve(dist, "manifest.json");

if (!existsSync(manifestPath)) {
  console.error(`No ${mode} build found at ${dist}. Run the ${mode} build first.`);
  process.exit(1);
}

const { version } = JSON.parse(readFileSync(manifestPath, "utf8")) as { version: string };
const suffix = mode === "production" ? "" : `-${mode}`;
const out = resolve(root, `careeros-extension-${version}${suffix}.zip`);
rmSync(out, { force: true });
execFileSync("zip", ["-r", "-q", "-X", out, "."], { cwd: dist, stdio: "inherit" });
console.warn(`Created ${out}`);
