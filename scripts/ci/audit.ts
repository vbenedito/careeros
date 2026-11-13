/**
 * pnpm audit with documented, expiring exceptions (ENV-08, grill T7): see audit-lib.ts.
 *   node scripts/ci/audit.ts
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { exceptionProblems } from "./audit-lib.ts";

const file = resolve(import.meta.dirname, "../../.github/audit-exceptions.json");
const data: unknown = JSON.parse(readFileSync(file, "utf8"));
const problems = exceptionProblems(data, new Date().toISOString().slice(0, 10));
for (const problem of problems) console.error(`::error title=Audit exceptions::${problem}`);
if (problems.length > 0) process.exit(1);

const ignores = Object.keys(data as object).flatMap((id) => ["--ignore", id]);
const result = spawnSync("pnpm", ["audit", "--prod", "--audit-level=high", ...ignores], {
  stdio: "inherit",
});
process.exit(result.status ?? 1);
