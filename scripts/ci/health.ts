/**
 * Daily production health check, evaluation side (ENV-13, ENV-14). No secrets and no network:
 *   node scripts/ci/health.ts db <health.csv>      counts from scripts/ops/health.sql
 *   node scripts/ci/health.ts backup <ISO date|''>  creation time of the newest backup artifact
 * Exit 1 on an anomaly, which makes GitHub email the person who last changed the schedule.
 */
import { appendFileSync, readFileSync } from "node:fs";
import { assessHealth, checkBackupFreshness, healthSummary, parseHealthCsv } from "./health-lib.ts";

const [mode, arg = ""] = process.argv.slice(2);
const summaryFile = process.env.GITHUB_STEP_SUMMARY;
const summary = (text: string) => {
  if (summaryFile) appendFileSync(summaryFile, text);
};

if (mode === "db") {
  const counts = parseHealthCsv(readFileSync(arg, "utf8"));
  const assessment = assessHealth(counts);
  const text = healthSummary(counts, assessment);
  process.stdout.write(text);
  summary(text);
  for (const failure of assessment.failures)
    console.error(`::error title=Production health::${failure}`);
  process.exit(assessment.failures.length === 0 ? 0 : 1);
} else if (mode === "backup") {
  const result = checkBackupFreshness(arg || undefined, new Date());
  const text = `## Backup freshness\n\n${result.ok ? "Result: **fresh**" : "Result: **STALE**"}\n\n${result.message}\n`;
  process.stdout.write(text);
  summary(text);
  if (!result.ok) console.error(`::error title=Backup freshness::${result.message}`);
  process.exit(result.ok ? 0 : 1);
} else {
  console.error("usage: node scripts/ci/health.ts db <health.csv> | backup <ISO date>");
  process.exit(2);
}
