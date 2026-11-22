/**
 * ADM-18: view model of the production health card. Pure functions over the last completed run
 * of six workflows; nothing here calls production, and only `status`, `conclusion` and
 * `updated_at` are kept (ADM-07).
 */

export interface WorkflowSpec {
  file: string;
  name: string;
  /** Hours after which a passing run is stale; `null` = no limit and no bar. */
  limitHours: number | null;
  /** Shown instead of a bar when there is no limit. */
  note: string | null;
}

export const WORKFLOWS: readonly WorkflowSpec[] = [
  { file: "smoke.yml", name: "Site check", limitHours: 36, note: null },
  { file: "health.yml", name: "Daily health check", limitHours: 36, note: null },
  { file: "backup.yml", name: "Weekly backup", limitHours: 8 * 24, note: null },
  {
    file: "migrate.yml",
    name: "Database migrations",
    limitHours: null,
    note: "Runs when a migration is merged",
  },
  { file: "ci.yml", name: "CI", limitHours: null, note: "Runs on pushes and pull requests" },
  {
    file: "codeql.yml",
    name: "Code scanning",
    limitHours: null,
    note: "Runs on pushes, pull requests and weekly",
  },
];

/** The backup is the one workflow whose freshness uses its newest successful run. */
export const BACKUP_FILE = "backup.yml";

export interface WorkflowRun {
  status: string;
  conclusion: string | null;
  /** ISO timestamp. */
  updatedAt: string;
}

export type WorkflowResult =
  | {
      ok: true;
      /** The newest completed run, or null when the workflow never ran. */
      run: WorkflowRun | null;
      /** The newest successful run (backup only); undefined when it was not read or failed. */
      lastGood?: WorkflowRun | null;
    }
  | { ok: false; httpStatus: number | null };

export interface HealthInput {
  file: string;
  result: WorkflowResult;
}

export type HealthStatus = "passing" | "failing" | "stale" | "cancelled" | "none" | "unknown";

export const STATUS_WORDS: Record<HealthStatus, string> = {
  passing: "Passing",
  failing: "Failing",
  stale: "Stale",
  cancelled: "Cancelled",
  none: "No run yet",
  unknown: "Unknown",
};

/** ADM-18: `success` passes; `failure`, `timed_out`, `startup_failure` fail; the rest as listed. */
export function statusOfConclusion(
  conclusion: string | null,
): "passing" | "failing" | "cancelled" | "unknown" {
  if (conclusion === "success") return "passing";
  if (conclusion === "failure" || conclusion === "timed_out" || conclusion === "startup_failure")
    return "failing";
  if (conclusion === "cancelled" || conclusion === "skipped") return "cancelled";
  return "unknown";
}

const HOUR_MS = 3_600_000;

/** "just now", "5 minutes ago", "3 hours ago", "3 days ago". */
export function formatAge(ms: number): string {
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"} ago`;
  const minutes = Math.floor(Math.max(0, ms) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return plural(minutes, "minute");
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return plural(hours, "hour");
  return plural(Math.floor(hours / 24), "day");
}

/** "36 hours", "8 days". */
export function formatLimit(hours: number): string {
  return hours % 24 === 0 ? `${hours / 24} days` : `${hours} hours`;
}

export interface HealthRow {
  file: string;
  name: string;
  status: HealthStatus;
  word: string;
  /** "HTTP 403" next to an Unknown word; null otherwise. */
  httpNote: string | null;
  /** Age of the newest completed run: "3 hours ago". */
  age: string | null;
  /** `YYYY-MM-DD HH:MM UTC` of that run, for the table. */
  finished: string | null;
  /** "limit 36 hours"; null when the workflow has no limit. */
  limit: string | null;
  /** Fill of the age bar, 0..100, stopping at 100; null when there is no bar. */
  barPercent: number | null;
  /** "Runs when a migration is merged"; null when the row has a limit. */
  note: string | null;
  /** "last good backup 3 days ago", when the newest run is not the last good one. */
  lastGood: string | null;
  needsAttention: boolean;
}

export interface HealthView {
  rows: HealthRow[];
  headline: string;
  attention: string[];
  /** Set when every row failed to load: the card then says "GitHub unavailable". */
  unavailable: { httpStatus: number | null } | null;
}

const ageMs = (run: WorkflowRun, now: Date): number | null => {
  const t = Date.parse(run.updatedAt);
  return Number.isNaN(t) ? null : now.getTime() - t;
};

const finishedText = (run: WorkflowRun): string | null => {
  const t = Date.parse(run.updatedAt);
  return Number.isNaN(t) ? null : `${new Date(t).toISOString().slice(0, 16).replace("T", " ")} UTC`;
};

function buildRow(spec: WorkflowSpec, result: WorkflowResult | undefined, now: Date): HealthRow {
  const base = {
    file: spec.file,
    name: spec.name,
    httpNote: null,
    age: null,
    finished: null,
    limit: spec.limitHours === null ? null : `limit ${formatLimit(spec.limitHours)}`,
    barPercent: null,
    note: spec.limitHours === null ? spec.note : null,
    lastGood: null,
  };
  const row = (status: HealthStatus, over: Partial<HealthRow> = {}): HealthRow => ({
    ...base,
    status,
    word: STATUS_WORDS[status],
    needsAttention: status !== "passing",
    ...over,
  });
  if (result === undefined) return row("unknown");
  if (!result.ok)
    return row("unknown", {
      httpNote: result.httpStatus === null ? null : `HTTP ${result.httpStatus}`,
    });
  const { run } = result;
  if (run === null) return row("none");
  const age = ageMs(run, now);
  if (age === null) return row("unknown");
  const limitMs = spec.limitHours === null ? null : spec.limitHours * HOUR_MS;
  let status: HealthStatus = statusOfConclusion(run.conclusion);
  if (status === "passing" && limitMs !== null && age > limitMs) status = "stale";

  // The backup's freshness is its newest successful run (ADM-18).
  const good = spec.file === BACKUP_FILE ? (result.lastGood ?? null) : null;
  const goodAge = good === null ? null : ageMs(good, now);
  const barAge = goodAge ?? age;
  const sameRun = good !== null && good.updatedAt === run.updatedAt;
  return row(status, {
    age: formatAge(age),
    finished: finishedText(run),
    barPercent:
      limitMs === null ? null : Math.round(Math.min(100, Math.max(0, (barAge / limitMs) * 100))),
    lastGood:
      good !== null && goodAge !== null && !sameRun
        ? `last good backup ${formatAge(goodAge)}`
        : null,
  });
}

export function buildHealth(inputs: readonly HealthInput[], now: Date): HealthView {
  const byFile = new Map(inputs.map((i) => [i.file, i.result]));
  const rows = WORKFLOWS.map((spec) => buildRow(spec, byFile.get(spec.file), now));
  const failed = WORKFLOWS.map((w) => byFile.get(w.file)).filter(
    (r): r is { ok: false; httpStatus: number | null } => r !== undefined && !r.ok,
  );
  const unavailable =
    failed.length === WORKFLOWS.length ? { httpStatus: failed[0]?.httpStatus ?? null } : null;
  const attention = rows.filter((r) => r.needsAttention).map((r) => r.name);
  const headline =
    attention.length === 0
      ? `All ${rows.length} checks are fine`
      : `${attention.length} of ${rows.length} ${attention.length === 1 ? "needs" : "need"} attention: ${attention.join(", ")}`;
  return { rows, headline, attention, unavailable };
}
