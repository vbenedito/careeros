/**
 * Pure logic of the daily production health check (ENV-13, ENV-14, grill H2/H7). The SQL in
 * `scripts/ops/health.sql` returns aggregate counts; this file decides whether they are healthy.
 * Thresholds are constants here and documented in docs/operations.md §7.
 */

/** Below this many uploads a day on average, the drop rule is too noisy to use. */
export const MIN_BASELINE_SESSIONS_PER_DAY = 20;
/** Fail when the last 24 h have fewer than this share of the prior 7-day daily average. */
export const DROP_RATIO = 0.25;
/** A scheduled backup is weekly: 7 days plus one day of slack. */
/**
 * Activity gate (low traffic must not cause a daily alert storm): both alerts need, in the 7 days
 * before the last 24 h, at least this many distinct uploading users AND this many days with uploads.
 */
export const MIN_PRIOR_USERS = 3;
export const MIN_PRIOR_ACTIVE_DAYS = 3;
export const BACKUP_MAX_AGE_DAYS = 8;

export interface HealthCounts {
  sessions24h: number;
  sessionsPrior7d: number;
  users24h: number;
  users7d: number;
  usersPrior7d: number;
  daysActivePrior7d: number;
  usersSilent24h: number;
  usersTotal: number;
  signups24h: number;
  linkRequests1h: number;
  linkLimitedUsers1h: number;
}

const COLUMNS: Record<keyof HealthCounts, string> = {
  sessions24h: "sessions_24h",
  sessionsPrior7d: "sessions_prior_7d",
  users24h: "users_24h",
  users7d: "users_7d",
  usersPrior7d: "users_prior_7d",
  daysActivePrior7d: "days_active_prior_7d",
  usersSilent24h: "users_silent_24h",
  usersTotal: "users_total",
  signups24h: "signups_24h",
  linkRequests1h: "link_requests_1h",
  linkLimitedUsers1h: "link_limited_users_1h",
};

/** Parses the `--csv` output of health.sql (one header line, one row of integers). */
export function parseHealthCsv(csv: string): HealthCounts {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim() !== "");
  if (lines.length !== 2) {
    throw new Error(
      `Expected a header and one row from the health query, got ${lines.length} lines.`,
    );
  }
  const names = (lines[0] as string).split(",");
  const values = (lines[1] as string).split(",");
  const out = {} as HealthCounts;
  for (const [key, column] of Object.entries(COLUMNS) as [keyof HealthCounts, string][]) {
    const index = names.indexOf(column);
    const raw = index < 0 ? undefined : values[index];
    const value = raw === undefined || raw === "" ? Number.NaN : Number(raw);
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`The health query returned no valid count for ${column}.`);
    }
    out[key] = value;
  }
  return out;
}

export interface HealthAssessment {
  /** Reasons the run must fail (and therefore email). */
  failures: string[];
  /** Observations that do not fail the run. */
  notes: string[];
}

/** Share of the users active in the last 7 days that uploaded nothing in the last 24 hours. */
export function silentRatio(
  c: Pick<HealthCounts, "users7d" | "usersSilent24h">,
): number | undefined {
  return c.users7d === 0 ? undefined : c.usersSilent24h / c.users7d;
}

export function assessHealth(c: HealthCounts): HealthAssessment {
  const failures: string[] = [];
  const notes: string[] = [];

  const gated = c.usersPrior7d >= MIN_PRIOR_USERS && c.daysActivePrior7d >= MIN_PRIOR_ACTIVE_DAYS;
  if (!gated && c.sessions24h === 0) {
    notes.push(
      `No uploads in 24 hours, but the alert is off: the 7 days before had ${c.usersPrior7d} uploading user(s) on ${c.daysActivePrior7d} day(s); it needs at least ${MIN_PRIOR_USERS} users on ${MIN_PRIOR_ACTIVE_DAYS} days.`,
    );
  }
  if (gated && c.sessions24h === 0) {
    failures.push(
      `No study sessions were uploaded in the last 24 hours, although ${c.usersPrior7d} user(s) uploaded in the 7 days before. Uploads may be failing (docs/operations.md §7).`,
    );
  }

  const baseline = c.sessionsPrior7d / 7;
  if (gated && c.sessions24h > 0 && baseline >= MIN_BASELINE_SESSIONS_PER_DAY) {
    if (c.sessions24h < DROP_RATIO * baseline) {
      failures.push(
        `Uploads dropped sharply: ${c.sessions24h} in the last 24 hours against a daily average of ${baseline.toFixed(1)} over the 7 days before (threshold: below ${Math.round(DROP_RATIO * 100)}%).`,
      );
    }
  } else if (c.sessions24h > 0) {
    notes.push(
      `The drop rule is off: it needs the activity gate and a prior daily average of at least ${MIN_BASELINE_SESSIONS_PER_DAY} uploads (now ${baseline.toFixed(1)}).`,
    );
  }

  const ratio = silentRatio(c);
  if (ratio !== undefined && ratio > 0.5) {
    notes.push(
      `${c.usersSilent24h} of ${c.users7d} users active in the last 7 days uploaded nothing in the last 24 hours.`,
    );
  }
  if (c.linkLimitedUsers1h > 0) {
    notes.push(
      `${c.linkLimitedUsers1h} user(s) hit the extension-link rate limit in the last hour (AUTH-08).`,
    );
  }
  return { failures, notes };
}

/** Markdown for the job summary: counts only. */
export function healthSummary(c: HealthCounts, a: HealthAssessment): string {
  const ratio = silentRatio(c);
  const rows: [string, string][] = [
    ["Sessions uploaded, last 24 h", String(c.sessions24h)],
    ["Sessions uploaded, the 7 days before", String(c.sessionsPrior7d)],
    ["Active users, last 24 h", String(c.users24h)],
    ["Active users, last 7 days", String(c.users7d)],
    ["Active users, the 7 days before the last 24 h", String(c.usersPrior7d)],
    ["Days with uploads, the 7 days before", String(c.daysActivePrior7d)],
    [
      "Active in 7 days but silent for 24 h",
      ratio === undefined ? "n/a" : `${c.usersSilent24h} (${Math.round(ratio * 100)}%)`,
    ],
    ["Accounts, total / new in 24 h", `${c.usersTotal} / ${c.signups24h}`],
    ["Extension-link requests, last hour", String(c.linkRequests1h)],
    ["Users at the link rate limit, last hour", String(c.linkLimitedUsers1h)],
  ];
  const lines = [
    "## Production health",
    "",
    a.failures.length === 0 ? "Result: **healthy**" : "Result: **ANOMALY**",
    "",
    "| Count | Value |",
    "|---|---|",
    ...rows.map(([name, value]) => `| ${name} | ${value} |`),
  ];
  if (a.failures.length > 0) lines.push("", ...a.failures.map((f) => `- **${f}**`));
  if (a.notes.length > 0) lines.push("", ...a.notes.map((n) => `- ${n}`));
  return `${lines.join("\n")}\n`;
}

export interface BackupFreshness {
  ok: boolean;
  message: string;
}

/** The newest scheduled-backup artifact must be younger than BACKUP_MAX_AGE_DAYS (ENV-14). */
export function checkBackupFreshness(
  latestCreatedAt: string | undefined,
  now: Date,
): BackupFreshness {
  if (!latestCreatedAt) {
    return {
      ok: false,
      message:
        "No unexpired backup artifact was found. The Backup workflow has not produced one (disabled schedule, missing configuration, or never run).",
    };
  }
  const created = new Date(latestCreatedAt);
  if (Number.isNaN(created.getTime())) {
    return { ok: false, message: "The latest backup artifact has an unreadable timestamp." };
  }
  const ageDays = (now.getTime() - created.getTime()) / 86_400_000;
  const age = `${ageDays.toFixed(1)} days`;
  return ageDays < BACKUP_MAX_AGE_DAYS
    ? { ok: true, message: `The latest backup is ${age} old (limit ${BACKUP_MAX_AGE_DAYS}).` }
    : {
        ok: false,
        message: `The latest backup is ${age} old, over the limit of ${BACKUP_MAX_AGE_DAYS} days. The Backup workflow may have been disabled by GitHub or is failing.`,
      };
}
