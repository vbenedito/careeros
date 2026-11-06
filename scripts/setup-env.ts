/**
 * pnpm setup:env — fills the local env files from the running local Supabase stack:
 *   apps/web/.env.local                (created from .env.example if missing)
 *   apps/extension/.env.development    (created from .env.example if missing)
 * Only the Supabase URL and keys are written; other values are left as they are.
 * Local keys are the Supabase CLI's development defaults, never production secrets.
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

let statusOutput: string;
try {
  statusOutput = execFileSync("pnpm", ["exec", "supabase", "status", "-o", "env"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
} catch {
  console.error("Local Supabase is not running. Start Docker Desktop, then run `pnpm db:start`.");
  process.exit(1);
}

const status = Object.fromEntries(
  statusOutput
    .split("\n")
    .map((line) => /^([A-Z_]+)="?(.*?)"?$/.exec(line.trim()))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => [m[1], m[2]]),
);
for (const key of ["API_URL", "PUBLISHABLE_KEY", "SECRET_KEY"]) {
  if (!status[key]) {
    console.error(`supabase status did not report ${key}`);
    process.exit(1);
  }
}

function update(file: string, values: Record<string, string>) {
  const path = resolve(root, file);
  const example = resolve(root, file.replace(/\.env\.[a-z]+$/, ".env.example"));
  if (!existsSync(path)) copyFileSync(example, path);
  let text = readFileSync(path, "utf8");
  for (const [key, value] of Object.entries(values)) {
    const line = `${key}=${value}`;
    const pattern = new RegExp(`^${key}=.*$`, "m");
    text = pattern.test(text) ? text.replace(pattern, () => line) : `${text.trimEnd()}\n${line}\n`;
  }
  writeFileSync(path, text);
  console.warn(`updated ${file}`);
}

update("apps/web/.env.local", {
  NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
  SUPABASE_SECRET_KEY: status.SECRET_KEY,
});
update("apps/extension/.env.development", {
  VITE_SUPABASE_URL: status.API_URL,
  VITE_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
});
console.warn(
  "Restart `pnpm --filter @careeros/web dev` and rebuild the extension to pick them up.",
);
