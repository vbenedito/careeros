/**
 * Guards against drift between code constants and the spec tables (the source of truth).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { AUTH, DATA, ENTITLEMENTS, PROBLEMS, PROTOCOL_VERSION, SYNC, TRACKING } from "./constants";

const specsDir = resolve(import.meta.dirname, "../../../specs/v0");

/** Reads `| \`NAME\` | value ... |` rows from a spec file into NAME → first number(s). */
function specConstants(file: string): Map<string, number[]> {
  const rows = new Map<string, number[]>();
  for (const line of readFileSync(resolve(specsDir, file), "utf8").split("\n")) {
    const match = /^\| `([A-Z_]+)` \| ([^|]+)\|/.exec(line);
    if (match?.[1] && match[2]) {
      const value = match[2].replace(/\(.*?\)/g, "");
      rows.set(match[1], (value.match(/\d+/g) ?? []).map(Number));
    }
  }
  return rows;
}

describe("constants match the specs", () => {
  it("01-tracking.md §2", () => {
    const spec = specConstants("01-tracking.md");
    for (const [name, value] of Object.entries(TRACKING)) {
      expect(spec.get(name), name).toEqual([value]);
    }
  });

  it("03-sync.md §2", () => {
    const spec = specConstants("03-sync.md");
    expect(spec.get("SYNC_PERIOD_MIN")).toEqual([SYNC.SYNC_PERIOD_MIN]);
    expect(spec.get("SYNC_BATCH_MAX")).toEqual([SYNC.SYNC_BATCH_MAX]);
    expect(spec.get("BACKOFF_MIN")).toEqual([...SYNC.BACKOFF_MIN]);
    expect(spec.get("LOCAL_QUEUE_MAX_AGE_D")).toEqual([SYNC.LOCAL_QUEUE_MAX_AGE_D]);
    expect(spec.get("INGEST_TIMEOUT_S")).toEqual([SYNC.INGEST_TIMEOUT_S]);
    expect(spec.get("CLOCK_RETRY_MAX")).toEqual([SYNC.CLOCK_RETRY_MAX]);
    expect(spec.get("DISCONNECT_WAIT_S")).toEqual([SYNC.DISCONNECT_WAIT_S]);
    expect(spec.get("CLOCK_SLACK_S")).toEqual([SYNC.CLOCK_SLACK_S]);
    expect(spec.get("DEFERRED_RETRY_CAP_MIN")).toEqual([SYNC.DEFERRED_RETRY_CAP_MIN]);
  });

  it("AUTH-10b AUTH-10c 02-auth.md timeouts", () => {
    const spec = specConstants("02-auth.md");
    for (const [name, value] of Object.entries(AUTH)) {
      expect(spec.get(name), name).toEqual([value]);
    }
  });

  it("01-tracking.md §2 has no constant missing from code", () => {
    expect([...specConstants("01-tracking.md").keys()].sort()).toEqual(
      Object.keys(TRACKING).sort(),
    );
  });

  it("04-data-model.md limits", () => {
    const spec = readFileSync(resolve(specsDir, "04-data-model.md"), "utf8");
    expect(spec).toContain(`at most **${DATA.MAX_TRACKED_DOMAINS}** tracked domains`);
    const maxAccepted = TRACKING.MAX_INTERVAL_S + DATA.INTERVAL_TOLERANCE_S;
    expect(spec).toContain(`interval '${maxAccepted} seconds'`);
    expect(spec).toContain(`length ≤ ${DATA.MAX_DOMAIN_LENGTH}`);
    expect(DATA.FUTURE_TOLERANCE_S).toBe(300);
    expect(spec).toContain("`ended_at <= now() + interval '5 minutes'`");
  });

  it("AUTH-07a protocol version starts at 1", () => {
    expect(PROTOCOL_VERSION).toBe(1);
  });

  it("ENT-05 ENT-06 ENT-11 specs/v1/02-entitlements.md §2 table equals ENTITLEMENTS", () => {
    const spec = readFileSync(
      resolve(import.meta.dirname, "../../../specs/v1/02-entitlements.md"),
      "utf8",
    );
    const row = (name: string) =>
      new RegExp(`^\\| \`${name}\` \\| \`?([^|\`]+?)\`? \\|`, "m").exec(spec)?.[1];
    expect(row("PLAN_FREE")).toBe(ENTITLEMENTS.PLAN_FREE);
    expect(row("FREE_MAX_TRACKED_DOMAINS")).toBe(`${ENTITLEMENTS.FREE_MAX_TRACKED_DOMAINS}`);
    expect(row("LIMIT_ERROR_CODE")).toBe(ENTITLEMENTS.LIMIT_ERROR_CODE);
    expect(row("LIMIT_ERROR_HINT")).toBe(ENTITLEMENTS.LIMIT_ERROR_HINT);
  });

  it("PRB-05 PRB-11 specs/v1/01-problems.md §2 table equals PROBLEMS", () => {
    const spec = readFileSync(
      resolve(import.meta.dirname, "../../../specs/v1/01-problems.md"),
      "utf8",
    );
    const row = (name: string) =>
      new RegExp(`^\\| \`${name}\` \\| \`?([^|\`]+?)\`? \\|`, "m").exec(spec)?.[1];
    // A list cell: every backticked token of the value column, in order.
    const listCell = /^\| `PROBLEM_DOMAINS` \| ([^|]+) \|/m.exec(spec)?.[1] ?? "";
    expect([...listCell.matchAll(/`([^`]+)`/g)].map((m) => m[1])).toEqual([
      ...PROBLEMS.PROBLEM_DOMAINS,
    ]);
    expect(row("PROBLEM_PATH_PREFIX")).toBe(PROBLEMS.PROBLEM_PATH_PREFIX);
    expect(row("PROBLEM_SLUG_PATTERN")).toBe(PROBLEMS.PROBLEM_SLUG_PATTERN.source);
    expect(row("PROBLEM_SLUG_MAX")).toBe(`${PROBLEMS.PROBLEM_SLUG_MAX}`);
    expect(row("PROBLEM_LIST_MAX")).toBe(`${PROBLEMS.PROBLEM_LIST_MAX}`);
  });

  it("PRB-05 the slug pattern accepts and refuses the spec examples", () => {
    for (const slug of ["two-sum", "3sum", "lru-cache"]) {
      expect(PROBLEMS.PROBLEM_SLUG_PATTERN.test(slug), slug).toBe(true);
    }
    for (const slug of ["Two-Sum", "two--sum", "-two", "two-", "two_sum", ""]) {
      expect(PROBLEMS.PROBLEM_SLUG_PATTERN.test(slug), slug).toBe(false);
    }
  });

  it("PSR-01..09 PSR-15 PSR-25 specs/v1/05-problem-sites.md §2 table equals PROBLEMS and ENTITLEMENTS", () => {
    const spec = readFileSync(
      resolve(import.meta.dirname, "../../../specs/v1/05-problem-sites.md"),
      "utf8",
    );
    const row = (name: string) =>
      new RegExp(`^\\| \`${name}\` \\| \`?([^|\`]+?)\`? \\|`, "m").exec(spec)?.[1];
    const tokens = (name: string) =>
      [
        ...(new RegExp(`^\\| \`${name}\` \\| ([^|]+) \\|`, "m").exec(spec)?.[1] ?? "").matchAll(
          /`([^`]+)`/g,
        ),
      ].map((m) => m[1]);
    expect(row("PROBLEM_RULE_PREFIX_MIN")).toBe(`${PROBLEMS.PROBLEM_RULE_PREFIX_MIN}`);
    expect(row("PROBLEM_RULE_PREFIX_MAX")).toBe(`${PROBLEMS.PROBLEM_RULE_PREFIX_MAX}`);
    expect(row("PROBLEM_RULE_SEGMENT_PATTERN")).toBe(PROBLEMS.PROBLEM_RULE_SEGMENT_PATTERN.source);
    expect(row("PROBLEM_RULE_SEGMENT_MAX")).toBe(`${PROBLEMS.PROBLEM_RULE_SEGMENT_MAX}`);
    expect(tokens("PROBLEM_ID_KINDS")).toEqual([...PROBLEMS.PROBLEM_ID_KINDS]);
    expect(/^\| `PROBLEM_ID_PATTERN` \(kind `id`\) \| `([^`]+)` \|/m.exec(spec)?.[1]).toBe(
      PROBLEMS.PROBLEM_ID_PATTERN.source,
    );
    expect(row("PROBLEM_ID_MAX")).toBe(`${PROBLEMS.PROBLEM_ID_MAX}`);
    expect(tokens("PROBLEM_RULE_RISKY_SEGMENTS")).toEqual([
      ...PROBLEMS.PROBLEM_RULE_RISKY_SEGMENTS,
    ]);
    expect(row("PROBLEM_ID_RANDOM_MIN")).toBe(`${PROBLEMS.PROBLEM_ID_RANDOM_MIN}`);
    expect(row("PROBLEM_RULE_LABEL_MAX")).toBe(`${PROBLEMS.PROBLEM_RULE_LABEL_MAX}`);
    expect(row("FREE_MAX_PROBLEM_RULES")).toBe(`${ENTITLEMENTS.FREE_MAX_PROBLEM_RULES}`);
    expect(spec).toContain(`\`hint\` = \`${ENTITLEMENTS.PROBLEM_RULES_LIMIT_ERROR_HINT}\``);
    // PSR-04: the built-in rules are today's list, with today's path prefix and slug kind.
    expect(PROBLEMS.BUILT_IN_PROBLEM_RULES.map((rule) => rule.domain)).toEqual([
      ...PROBLEMS.PROBLEM_DOMAINS,
    ]);
    for (const rule of PROBLEMS.BUILT_IN_PROBLEM_RULES) {
      expect(`/${rule.prefix.join("/")}/`).toBe(PROBLEMS.PROBLEM_PATH_PREFIX);
      expect(rule.kind).toBe("slug");
    }
  });

  it("PSR-07 PSR-25 O6 the id pattern accepts and refuses the spec examples", () => {
    for (const id of ["cmlz26cxp08st08adxvy89hr1", "Ab_12", "a-b_c", "3Sum"]) {
      expect(PROBLEMS.PROBLEM_ID_PATTERN.test(id), id).toBe(true);
    }
    for (const id of ["abc%20", "a@b.c", "a.b", "a=1", "a+b", "a~b", "a--b", "_a", "a_", ""]) {
      expect(PROBLEMS.PROBLEM_ID_PATTERN.test(id), id).toBe(false);
    }
    for (const segment of ["practice", "system-design", "a.b_c-d", "v2"]) {
      expect(PROBLEMS.PROBLEM_RULE_SEGMENT_PATTERN.test(segment), segment).toBe(true);
    }
    for (const segment of ["Practice", "a%20b", "-a", "a/b", "a b", ""]) {
      expect(PROBLEMS.PROBLEM_RULE_SEGMENT_PATTERN.test(segment), segment).toBe(false);
    }
  });

  it("ENT-01 the old site-limit constant is the free plan's limit", () => {
    expect(DATA.MAX_TRACKED_DOMAINS).toBe(ENTITLEMENTS.FREE_MAX_TRACKED_DOMAINS);
  });
});
