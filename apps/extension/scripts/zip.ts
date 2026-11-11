/**
 * Packages a built extension into a release zip (ENV-05a):
 *   pnpm --filter @careeros/extension release   → careeros-extension-<version>.zip (production)
 *   pnpm --filter @careeros/extension release:store → careeros-extension-<version>-store.zip:
 *     the same build with no manifest `key`, for the Chrome Web Store (STORE-01)
 * Uses the system `zip` (available on macOS and GitHub's Ubuntu runners).
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const mode = args.find((a) => !a.startsWith("--")) ?? "production";
const store = args.includes("--store");
if (store && mode !== "production") {
  console.error("--store packages only the production build (STORE-01).");
  process.exit(1);
}
const dist = resolve(root, "dist", mode);
const manifestPath = resolve(dist, "manifest.json");

if (!existsSync(manifestPath)) {
  console.error(`No ${mode} build found at ${dist}. Run the ${mode} build first.`);
  process.exit(1);
}

const { version } = JSON.parse(readFileSync(manifestPath, "utf8")) as { version: string };
const suffix = (mode === "production" ? "" : `-${mode}`) + (store ? "-store" : "");
const out = resolve(root, `careeros-extension-${version}${suffix}.zip`);
rmSync(out, { force: true });
let source = dist;
if (store) {
  // Copy the build and drop the manifest key: the store assigns the ID (STORE-01).
  source = mkdtempSync(join(tmpdir(), "careeros-store-"));
  cpSync(dist, source, { recursive: true });
  const manifest = JSON.parse(readFileSync(join(source, "manifest.json"), "utf8"));
  // Same rule as storeManifest() in manifest.config.ts, where it is tested.
  delete manifest.key;
  if ("key" in manifest) throw new Error("store manifest still has a key");
  writeFileSync(join(source, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}
try {
  execFileSync("zip", ["-r", "-q", "-X", out, "."], { cwd: source, stdio: "inherit" });
} finally {
  if (store) rmSync(source, { recursive: true, force: true });
}
console.warn(`Created ${out}`);
