import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assessHealth,
  BACKUP_MAX_AGE_DAYS,
  checkBackupFreshness,
  type HealthCounts,
  healthSummary,
  parseHealthCsv,
  silentRatio,
} from "./health-lib.ts";

const base: HealthCounts = {
  sessions24h: 40,
  sessionsPrior7d: 280,
  users24h: 5,
  users7d: 8,
  usersPrior7d: 8,
  daysActivePrior7d: 7,
  usersSilent24h: 3,
  usersTotal: 20,
  signups24h: 1,
  linkRequests1h: 2,
  linkLimitedUsers1h: 0,
};

describe("ENV-13 health: parsing the query output", () => {
  const header =
    "sessions_24h,sessions_prior_7d,users_24h,users_7d,users_prior_7d,days_active_prior_7d,users_silent_24h,users_total,signups_24h,link_requests_1h,link_limited_users_1h";

  it("ENV-13 parses one header and one row of counts", () => {
    expect(parseHealthCsv(`${header}\n40,280,5,8,8,7,3,20,1,2,0\n`)).toEqual(base);
  });

  it("ENV-13 refuses output that is not one row of integers", () => {
    expect(() => parseHealthCsv("")).toThrow(/header and one row/);
    expect(() => parseHealthCsv(`${header}\n1,2,3\n`)).toThrow(/no valid count/);
    expect(() => parseHealthCsv(`${header}\n40,280,5,8,8,7,3,20,1,2,x\n`)).toThrow(/link_limited/);
    expect(() => parseHealthCsv(`${header}\n40,280,5,8,8,7,3,20,1,2,-1\n`)).toThrow(
      /no valid count/,
    );
  });
});

describe("ENV-13 health: what fails the run", () => {
  it("ENV-13 a normal day is healthy", () => {
    expect(assessHealth(base).failures).toEqual([]);
  });

  it("ENV-13 zero uploads in 24 h while a user uploaded in the 7 days before fails", () => {
    const a = assessHealth({ ...base, sessions24h: 0, users24h: 0, usersSilent24h: 8 });
    expect(a.failures).toHaveLength(1);
    expect(a.failures[0]).toContain("No study sessions were uploaded in the last 24 hours");
  });

  it("ENV-13 low traffic does not alert: needs 3 users on 3 days in the prior 7 days", () => {
    const zero = { ...base, sessions24h: 0, users24h: 0 };
    expect(assessHealth({ ...zero, usersPrior7d: 2 }).failures).toEqual([]);
    expect(assessHealth({ ...zero, usersPrior7d: 2 }).notes.join()).toContain("alert is off");
    expect(assessHealth({ ...zero, daysActivePrior7d: 2 }).failures).toEqual([]);
    expect(assessHealth({ ...zero, usersPrior7d: 3, daysActivePrior7d: 3 }).failures).toHaveLength(
      1,
    );
    // The drop rule is gated the same way.
    expect(assessHealth({ ...base, sessions24h: 1, daysActivePrior7d: 2 }).failures).toEqual([]);
  });

  it("ENV-13 zero uploads with nobody active before is not an anomaly", () => {
    const quiet: HealthCounts = {
      ...base,
      sessions24h: 0,
      sessionsPrior7d: 0,
      users24h: 0,
      users7d: 0,
      usersPrior7d: 0,
      daysActivePrior7d: 0,
      usersSilent24h: 0,
    };
    expect(assessHealth(quiet).failures).toEqual([]);
  });

  it("ENV-13 a drop below 25% of the prior daily average fails once the average is 20 or more", () => {
    // Baseline 40/day: 9 is below 10 (25%), 10 is not.
    expect(assessHealth({ ...base, sessions24h: 9 }).failures[0]).toContain("dropped sharply");
    expect(assessHealth({ ...base, sessions24h: 10 }).failures).toEqual([]);
  });

  it("ENV-13 below 20 uploads a day on average the drop rule is off and says so", () => {
    const small = assessHealth({ ...base, sessions24h: 1, sessionsPrior7d: 133 });
    expect(small.failures).toEqual([]);
    expect(small.notes.join()).toContain("drop rule is off");
  });

  it("ENV-13 the silent-user ratio is a note, not a failure", () => {
    const a = assessHealth({ ...base, usersSilent24h: 7 });
    expect(a.failures).toEqual([]);
    expect(a.notes.join()).toContain("7 of 8 users");
    expect(silentRatio({ users7d: 0, usersSilent24h: 0 })).toBeUndefined();
    expect(silentRatio({ users7d: 8, usersSilent24h: 2 })).toBe(0.25);
  });

  it("ENV-13 users at the link rate limit are noted", () => {
    expect(assessHealth({ ...base, linkLimitedUsers1h: 2 }).notes.join()).toContain("rate limit");
  });

  it("ENV-13 the summary has counts only, and flags an anomaly", () => {
    const text = healthSummary(base, assessHealth(base));
    expect(text).toContain("Result: **healthy**");
    expect(text).toContain("| Sessions uploaded, last 24 h | 40 |");
    const bad = healthSummary(
      { ...base, sessions24h: 0 },
      assessHealth({ ...base, sessions24h: 0 }),
    );
    expect(bad).toContain("Result: **ANOMALY**");
  });
});

describe("ENV-13 health: the query is read-only and aggregate-only", () => {
  const sql = readFileSync(resolve(import.meta.dirname, "../ops/health.sql"), "utf8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .toLowerCase();

  it("ENV-13 runs in a READ ONLY transaction before any query", () => {
    expect(sql.indexOf("set transaction read only")).toBeGreaterThan(sql.indexOf("begin;"));
    expect(sql.indexOf("set transaction read only")).toBeLessThan(sql.indexOf("select"));
    expect(sql.trim().endsWith("rollback;")).toBe(true);
  });

  it("ENV-13 contains no write statement", () => {
    for (const word of [
      "insert",
      "update",
      "delete",
      "truncate",
      "drop",
      "alter",
      "create",
      "grant",
    ]) {
      expect(sql).not.toMatch(new RegExp(`\\b${word}\\b`));
    }
  });

  it("ENV-13 selects no identifying column", () => {
    expect(sql).not.toMatch(/\bemail\b|\bdomain\b|raw_user_meta|\bphone\b/);
    // user_id appears only inside count(distinct …) or subqueries that are counted.
    expect(sql.match(/select\s+user_id/g)?.length).toBe(2);
  });
});

describe("ENV-14 backup freshness", () => {
  const now = new Date("2026-11-13T07:00:00Z");

  it("ENV-14 a backup younger than 8 days is fresh", () => {
    expect(checkBackupFreshness("2026-11-09T06:20:00Z", now).ok).toBe(true);
    expect(checkBackupFreshness("2026-11-06T08:00:00Z", now).ok).toBe(true);
  });

  it("ENV-14 a backup of 8 days or more is stale", () => {
    const result = checkBackupFreshness("2026-11-05T06:00:00Z", now);
    expect(result.ok).toBe(false);
    expect(result.message).toContain(`over the limit of ${BACKUP_MAX_AGE_DAYS} days`);
  });

  it("ENV-14 no artifact at all, or an unreadable date, is stale", () => {
    expect(checkBackupFreshness(undefined, now).ok).toBe(false);
    expect(checkBackupFreshness("garbage", now).ok).toBe(false);
  });
});
