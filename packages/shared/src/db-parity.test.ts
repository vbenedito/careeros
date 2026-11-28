/**
 * The database domain type `public.hostname` must accept exactly what isValidDomain() accepts.
 * This test reads the migration and fails if the regex or limits drift apart.
 */
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DATA, ENTITLEMENTS, PROBLEMS, SYNC, TRACKING } from "./constants";
import { DOMAIN_PATTERN } from "./domain";

const migrationsDir = resolve(import.meta.dirname, "../../../supabase/migrations");

function hostnameDomainSql(): string {
  for (const file of readdirSync(migrationsDir).sort()) {
    const sql = readFileSync(resolve(migrationsDir, file), "utf8");
    const match = /create domain public\.hostname[\s\S]*?\);/.exec(sql);
    if (match) return match[0];
  }
  throw new Error("public.hostname domain not found in supabase/migrations");
}

describe("database parity", () => {
  const sql = hostnameDomainSql();

  it("TRK-03 the DB regex equals DOMAIN_PATTERN", () => {
    const regex = /value ~ '([^']+)'/.exec(sql)?.[1];
    expect(regex).toBe(DOMAIN_PATTERN.source);
  });

  it("TRK-03 the DB rejects a leading www. like isValidDomain", () => {
    expect(sql).toContain("value !~ '^www\\.'");
  });

  it("the DB length limit equals MAX_DOMAIN_LENGTH", () => {
    expect(sql).toContain(`length(value) <= ${DATA.MAX_DOMAIN_LENGTH}`);
  });
});

/**
 * A4 (grill 2026-11-12): the ingest and totals SQL repeat constants that also live in
 * packages/shared (and in the specs). Each function is read from the LATEST migration that
 * defines it (`create [or replace] function`), because that is the version the database runs.
 */
const specsDir = resolve(import.meta.dirname, "../../../specs/v0");

/** Body of the latest `create [or replace] function <name>(` across the migrations. */
function latestFunctionSql(name: string): { file: string; sql: string } {
  const header = new RegExp(`create (?:or replace )?function ${name.replace(".", "\\.")}\\(`);
  for (const file of readdirSync(migrationsDir).sort().reverse()) {
    const sql = readFileSync(resolve(migrationsDir, file), "utf8");
    const start = sql.search(header);
    if (start === -1) continue;
    const end = sql.indexOf("\n$$;", start);
    if (end === -1) throw new Error(`${name} in ${file} has no closing $$;`);
    return { file, sql: sql.slice(start, end) };
  }
  throw new Error(`function ${name} not found in supabase/migrations`);
}

const occurrences = (sql: string, pattern: RegExp) => [...sql.matchAll(pattern)].map((m) => m[1]);

describe("database parity: ingest and totals constants", () => {
  // Since #178 both ingest RPCs are thin wrappers around one shared implementation (ADR-0011).
  const parser = latestFunctionSql("private.parse_session_element");
  const ingest = latestFunctionSql("private.ingest_sessions");
  const spec = readFileSync(resolve(specsDir, "04-data-model.md"), "utf8");

  it("DATA-06b both ingest RPCs delegate to the shared implementation", () => {
    expect(latestFunctionSql("public.ingest_study_sessions").sql).toContain(
      "private.ingest_sessions(sessions, false)",
    );
    expect(latestFunctionSql("public.ingest_study_sessions_v2").sql).toContain(
      "private.ingest_sessions(sessions, true)",
    );
  });

  it("TEST-08 DATA-02 every interval cap in the SQL equals MAX_INTERVAL_S + INTERVAL_TOLERANCE_S", () => {
    const cap = `${TRACKING.MAX_INTERVAL_S + DATA.INTERVAL_TOLERANCE_S}`;
    expect(occurrences(parser.sql, /interval '(\d+) seconds'/g)).toEqual([cap]);
    // The overlap look-back is the same cap: no stored interval can start earlier and still overlap.
    expect(occurrences(ingest.sql, /interval '(\d+) seconds'/g)).toEqual([cap]);
    // The table CHECK repeats it.
    // Read from the latest migration that defines the constraint (a later one may re-create it).
    const latestCheck = readdirSync(migrationsDir)
      .sort()
      .reverse()
      .map((file) => readFileSync(resolve(migrationsDir, file), "utf8"))
      .find((sql) => /study_sessions_max_duration check/.test(sql));
    expect(latestCheck, "study_sessions_max_duration not found").toBeDefined();
    expect(
      occurrences(
        latestCheck ?? "",
        /study_sessions_max_duration check .*interval '(\d+) seconds'/g,
      ),
    ).toEqual([cap]);
  });

  it("TEST-08 DATA-07 the age limit equals LOCAL_QUEUE_MAX_AGE_D days", () => {
    expect(occurrences(parser.sql, /started_at < now\(\) - interval '(\d+) days'/g)).toEqual([
      `${SYNC.LOCAL_QUEUE_MAX_AGE_D}`,
    ]);
  });

  it("TEST-08 DATA-07 the future tolerance equals FUTURE_TOLERANCE_S", () => {
    expect(occurrences(parser.sql, /ended_at > now\(\) \+ interval '(\d+) minutes'/g)).toEqual([
      `${DATA.FUTURE_TOLERANCE_S / 60}`,
    ]);
  });

  it("TEST-08 SYNC-04 the batch limit equals SYNC_BATCH_MAX", () => {
    expect(occurrences(ingest.sql, /jsonb_array_length\(sessions\) > (\d+)/g)).toEqual([
      `${SYNC.SYNC_BATCH_MAX}`,
    ]);
    expect(ingest.sql).toContain(`at most ${SYNC.SYNC_BATCH_MAX} sessions per call`);
    const syncSpec = readFileSync(resolve(specsDir, "03-sync.md"), "utf8");
    expect(syncSpec).toContain(`| \`SYNC_BATCH_MAX\` | ${SYNC.SYNC_BATCH_MAX} intervals |`);
    expect(spec).toContain(`has > ${SYNC.SYNC_BATCH_MAX} elements`);
  });

  it("TEST-08 DATA-09 the abuse limits in the SQL equal the spec (1,000 per hour, 3,500 per 24 hours)", () => {
    expect(
      occurrences(ingest.sql, /created_at > now\(\) - interval '1 hour'\s*\) >= (\d+)/g),
    ).toEqual(["1000"]);
    expect(
      occurrences(ingest.sql, /created_at > now\(\) - interval '24 hours'\s*\) >= (\d+)/g),
    ).toEqual(["3500"]);
    expect(spec).toMatch(/≥ 1,000 rows in the last hour or ≥ 3,500 rows in the last 24 hours/);
  });

  it("TEST-08 the payload limit is 128 kB", () => {
    expect(occurrences(ingest.sql, /octet_length\(sessions::text\) > (\d+)/g)).toEqual([
      `${128 * 1024}`,
    ]);
  });

  it("TEST-08 DATA-10 DATA-11 DATA-15a every totals function accepts at most 92 days, as the spec says", () => {
    for (const name of [
      "public.get_daily_totals",
      "public.get_domain_totals",
      "public.get_problem_totals_v2",
    ]) {
      const { sql } = latestFunctionSql(name);
      expect(occurrences(sql, /p_to - p_from \+ 1 > (\d+)/g), name).toEqual(["92"]);
    }
    expect(spec).toContain("> 92 days");
  });

  it("ENT-03 ENT-05 ENT-06 the latest trigger reads its limit from the plan and keeps the error contract", () => {
    const { sql } = latestFunctionSql("private.enforce_tracked_domain_limit");
    // No literal limit: the number comes from public.plans through private.plan_of (ENT-03).
    expect(
      occurrences(sql, /count\(\*\) from public\.tracked_domains[^;]*>= (\S+)\)? then/g),
    ).toEqual(["v_limit"]);
    expect(sql).toContain("private.plan_of(new.user_id)");
    expect(sql).toContain("from public.plans");
    expect(sql).toContain("pg_advisory_xact_lock");
    // ENT-05, ENT-06: same errcode and hint as before, message with the plan's number, new detail.
    expect(sql).toContain("'A user can track at most % domains'");
    expect(occurrences(sql, /errcode = '(\w+)'/g)).toContain("P0001");
    expect(sql).toContain(`hint = '${ENTITLEMENTS.LIMIT_ERROR_HINT}'`);
    expect(sql).toContain(`'code', '${ENTITLEMENTS.LIMIT_ERROR_CODE}'`);
  });
});

/**
 * ENT-11: the free plan's limits in the migrations equal the shared constants. The value is read
 * from the LAST migration that sets the `free` row (an insert, or a later update), because that
 * is what the database holds after all migrations ran.
 */
function lastFreePlanLimit(column = "max_tracked_domains"): { file: string; limit: string } {
  // The first limit column is set by the insert of the plans table; later columns by an update.
  const insert = /insert into public\.plans\s*\([^)]*\)\s*values\s*\(\s*'free'\s*,\s*(\d+)\s*\)/gi;
  const update = new RegExp(
    `update public\\.plans\\s+set\\s+${column}\\s*=\\s*(\\d+)\\s+where\\s+id\\s*=\\s*'free'`,
    "gi",
  );
  for (const file of readdirSync(migrationsDir).sort().reverse()) {
    const sql = readFileSync(resolve(migrationsDir, file), "utf8");
    // Within one file the last statement wins.
    const hits = [
      ...(column === "max_tracked_domains" ? sql.matchAll(insert) : []),
      ...sql.matchAll(update),
    ].sort((x, y) => (x.index ?? 0) - (y.index ?? 0));
    const last = hits.at(-1)?.[1];
    if (last) return { file, limit: last };
  }
  throw new Error(`no migration sets ${column} of the free row of public.plans`);
}

describe("database parity: entitlements", () => {
  it("ENT-11 the free plan's max_tracked_domains in the migrations equals ENTITLEMENTS", () => {
    expect(lastFreePlanLimit().limit).toBe(`${ENTITLEMENTS.FREE_MAX_TRACKED_DOMAINS}`);
  });

  it("ENT-11 PSR-15 the free plan's max_problem_rules in the migrations equals ENTITLEMENTS", () => {
    expect(lastFreePlanLimit("max_problem_rules").limit).toBe(
      `${ENTITLEMENTS.FREE_MAX_PROBLEM_RULES}`,
    );
  });

  it("ENT-11 PSR-15 the rule-limit trigger reads its number from the plan and keeps the PSR-15 error contract", () => {
    const { sql } = latestFunctionSql("private.enforce_problem_rule_limit");
    expect(
      occurrences(sql, /count\(\*\) from public\.problem_rules[^;]*>= (\S+)\)? then/g),
    ).toEqual(["v_limit"]);
    expect(sql).toContain("private.plan_of(new.user_id)");
    expect(sql).toContain("p.max_problem_rules");
    expect(sql).toContain("removed_at is null");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("'A user can add at most % problem rules'");
    expect(occurrences(sql, /errcode = '(\w+)'/g)).toContain("P0001");
    expect(sql).toContain(`hint = '${ENTITLEMENTS.PROBLEM_RULES_LIMIT_ERROR_HINT}'`);
    expect(sql).toContain(`'code', '${ENTITLEMENTS.LIMIT_ERROR_CODE}'`);
    expect(sql).toContain("'kind', 'problem_rules'");
  });

  it("ENT-11 the free plan id in the migrations equals PLAN_FREE", () => {
    const { sql } = latestFunctionSql("private.plan_of");
    expect(occurrences(sql, /select '(\w+)'::text/g)).toEqual([ENTITLEMENTS.PLAN_FREE]);
  });
});

/**
 * PRB-05, DATA-16: the problem domain, slug pattern and length in the database equal PROBLEMS
 * (table CHECK and the ingest v2 parser), and the problem list limit equals PROBLEM_LIST_MAX.
 */
describe("database parity: problems", () => {
  const code = (sql: string) => sql.replace(/--[^\n]*/g, "");
  const parser = latestFunctionSql("private.parse_session_element").sql;
  const trigger = latestFunctionSql("private.check_problem_row").sql;
  /** The latest definition of the CHECK on the stored id (a later migration may re-create it). */
  const idCheck = (() => {
    for (const file of readdirSync(migrationsDir).sort().reverse()) {
      const sql = readFileSync(resolve(migrationsDir, file), "utf8");
      const match = [
        ...sql.matchAll(/study_session_problems_slug_check check \(([\s\S]*?)\n\s*\)(?:,|;)/g),
      ].at(-1);
      if (match) return match[1] as string;
    }
    throw new Error("study_session_problems_slug_check not found in supabase/migrations");
  })();

  it("PRB-05 PSR-23 PSR-24 the built-in slug pattern (first) and the user-rule id pattern (second) in the parser and the trigger equal PROBLEMS", () => {
    const patterns = [PROBLEMS.PROBLEM_SLUG_PATTERN.source, PROBLEMS.PROBLEM_ID_PATTERN.source];
    expect(occurrences(parser, /\(element ->> 'problem'\) !~ '([^']+)'/g)).toEqual(patterns);
    expect(occurrences(trigger, /new\.problem_slug !~ '([^']+)'/g)).toEqual(patterns);
  });

  it("PRB-05 PSR-23 PSR-24 the slug limit (first) and PROBLEM_ID_MAX (second) in the parser and the trigger equal PROBLEMS", () => {
    const limits = [`${PROBLEMS.PROBLEM_SLUG_MAX}`, `${PROBLEMS.PROBLEM_ID_MAX}`];
    expect(occurrences(parser, /char_length\(element ->> 'problem'\) > (\d+)/g)).toEqual(limits);
    expect(occurrences(trigger, /char_length\(new\.problem_slug\) > (\d+)/g)).toEqual(limits);
  });

  it("PSR-24 DATA-16 the stored-id column CHECK is widened to PROBLEM_ID_PATTERN and keeps PROBLEM_SLUG_MAX", () => {
    expect(occurrences(idCheck, /problem_slug ~ '([^']+)'/g)).toEqual([
      PROBLEMS.PROBLEM_ID_PATTERN.source,
    ]);
    expect(occurrences(idCheck, /char_length\(problem_slug\) <= (\d+)/g)).toEqual([
      `${PROBLEMS.PROBLEM_SLUG_MAX}`,
    ]);
  });

  // PRB-18, PSR-04: the built-in rules are written once in SQL, in private.problem_domains(); the
  // trigger and the ingest parser call it, so they cannot differ from each other.
  const domainsFn = latestFunctionSql("private.problem_domains").sql;
  const listed = (sql: string) => [...sql.matchAll(/'([^']+)'/g)].map((m) => m[1]);

  it("PRB-18 PSR-04 private.problem_domains() equals PROBLEM_DOMAINS and the domains of BUILT_IN_PROBLEM_RULES", () => {
    const array = /array\[([^\]]+)\]/.exec(domainsFn)?.[1] ?? "";
    expect(listed(array)).toEqual([...PROBLEMS.PROBLEM_DOMAINS]);
    expect(listed(array)).toEqual(PROBLEMS.BUILT_IN_PROBLEM_RULES.map((rule) => rule.domain));
    expect(domainsFn).toContain("immutable");
  });

  it("PRB-18 PROBLEM_DOMAINS has no duplicates", () => {
    expect(new Set(PROBLEMS.PROBLEM_DOMAINS).size).toBe(PROBLEMS.PROBLEM_DOMAINS.length);
  });

  it("PSR-24 DATA-16 the literal domain CHECK is dropped and the trigger that replaces it reads the one list; neither the parser nor the trigger has a domain literal", () => {
    let last: string | undefined;
    for (const file of readdirSync(migrationsDir).sort()) {
      const sql = readFileSync(resolve(migrationsDir, file), "utf8");
      const drops = [...sql.matchAll(/drop constraint study_session_problems_domain_check/g)]
        .length;
      const adds = [...sql.matchAll(/add constraint study_session_problems_domain_check/g)].length;
      if (drops > adds) last = file;
      else if (adds > 0) last = undefined;
    }
    expect(last, "the last migration that touches the domain check must drop it").toBeDefined();
    const migration = readFileSync(resolve(migrationsDir, last ?? ""), "utf8");
    expect(migration).toMatch(
      /create trigger study_session_problems_rule_check\s+before insert or update of domain, problem_slug, user_id on public\.study_session_problems\s+for each row execute function private\.check_problem_row\(\)/,
    );
    expect(occurrences(trigger, /errcode = '(\w+)'/g)).toEqual(["23514", "23514"]);
    for (const sql of [parser, trigger]) {
      expect(sql).toContain("private.problem_domains()");
      for (const domain of PROBLEMS.PROBLEM_DOMAINS) expect(code(sql)).not.toContain(`'${domain}'`);
    }
  });

  it("PRB-18 the shared ingest implementation names no problem domain", () => {
    const ingest = latestFunctionSql("private.ingest_sessions").sql;
    for (const domain of PROBLEMS.PROBLEM_DOMAINS) expect(ingest).not.toContain(domain);
  });

  it("DATA-15a #241 get_problem_totals is dropped by the last migration that mentions it (NC-e)", () => {
    const last = readdirSync(migrationsDir)
      .sort()
      .reverse()
      .find((file) =>
        /\bget_problem_totals\(/.test(readFileSync(resolve(migrationsDir, file), "utf8")),
      );
    expect(last).toBe("20261127100000_drop_get_problem_totals.sql");
    const sql = readFileSync(resolve(migrationsDir, last ?? ""), "utf8");
    expect(sql).toMatch(
      /drop function (?:if exists )?public\.get_problem_totals\(date, date, text\);/,
    );
  });

  it("PRB-11 DATA-15a get_problem_totals_v2 returns at most PROBLEM_LIST_MAX rows", () => {
    const { sql } = latestFunctionSql("public.get_problem_totals_v2");
    expect(occurrences(sql, /limit (\d+);/g)).toEqual([`${PROBLEMS.PROBLEM_LIST_MAX}`]);
  });
});

/**
 * PSR-01, PSR-06, PSR-07, PSR-15, PSR-22: the problem_rules table and the add RPC repeat the rule
 * limits of the template language; they must equal PROBLEMS.
 */
describe("database parity: problem rules", () => {
  const table = (() => {
    for (const file of readdirSync(migrationsDir).sort().reverse()) {
      const sql = readFileSync(resolve(migrationsDir, file), "utf8");
      const match = /create table public\.problem_rules \([\s\S]*?\n\);/.exec(sql);
      if (match) return match[0];
    }
    throw new Error("problem_rules not found in supabase/migrations");
  })();
  const add = latestFunctionSql("public.add_problem_rule").sql;
  const segment = PROBLEMS.PROBLEM_RULE_SEGMENT_PATTERN.source.slice(1, -1);
  const listed = (sql: string) => [...sql.matchAll(/'([^']+)'/g)].map((m) => m[1]);

  it("PSR-07 the kinds in the table CHECK and in the RPC equal PROBLEM_ID_KINDS", () => {
    expect(listed(/kind in \(([^)]+)\)/.exec(table)?.[1] ?? "")).toEqual([
      ...PROBLEMS.PROBLEM_ID_KINDS,
    ]);
    expect(listed(/p_kind not in \(([^)]+)\)/.exec(add)?.[1] ?? "")).toEqual([
      ...PROBLEMS.PROBLEM_ID_KINDS,
    ]);
  });

  it("PSR-06 the segment pattern in the RPC and in the table CHECK equals PROBLEM_RULE_SEGMENT_PATTERN", () => {
    expect(occurrences(add, /v_segment !~ '([^']+)'/g)).toEqual([
      PROBLEMS.PROBLEM_RULE_SEGMENT_PATTERN.source,
    ]);
    const joined = `^${segment}(?:/${segment}){0,${PROBLEMS.PROBLEM_RULE_PREFIX_MAX - 1}}$`;
    expect(occurrences(table, /array_to_string\(prefix, '\/'\)\s+~ '([^']+)'/g)).toEqual([joined]);
  });

  it("PSR-06 the prefix count and the segment length limits equal PROBLEMS", () => {
    const { PROBLEM_RULE_PREFIX_MIN: min, PROBLEM_RULE_PREFIX_MAX: max } = PROBLEMS;
    expect(occurrences(table, /cardinality\(prefix\) between (\d+ and \d+)/g)).toEqual([
      `${min} and ${max}`,
    ]);
    expect(occurrences(add, /cardinality\(p_prefix\) not between (\d+ and \d+)/g)).toEqual([
      `${min} and ${max}`,
    ]);
    const tooLong = PROBLEMS.PROBLEM_RULE_SEGMENT_MAX + 1;
    expect(occurrences(table, /!~ '\[\^\/\]\{(\d+)\}'/g)).toEqual([`${tooLong}`]);
    expect(occurrences(add, /char_length\(v_segment\) > (\d+)/g)).toEqual([
      `${PROBLEMS.PROBLEM_RULE_SEGMENT_MAX}`,
    ]);
  });

  it("PSR-01 the label limit in the table CHECK and in the RPC equals PROBLEM_RULE_LABEL_MAX", () => {
    expect(occurrences(table, /char_length\(label\) between 1 and (\d+)/g)).toEqual([
      `${PROBLEMS.PROBLEM_RULE_LABEL_MAX}`,
    ]);
    expect(occurrences(add, /char_length\(v_label\) > (\d+)/g)).toEqual([
      `${PROBLEMS.PROBLEM_RULE_LABEL_MAX}`,
    ]);
  });

  it("PSR-04 O5 the RPC refuses the built-in domains through private.problem_domains(), with no literal", () => {
    expect(add).toContain("= any (private.problem_domains())");
    for (const domain of PROBLEMS.PROBLEM_DOMAINS) expect(add).not.toContain(`'${domain}'`);
  });
});

/**
 * #178 escaped defect: two new user-data tables were not in the backup dump. Every public table
 * a migration creates must be dumped by scripts/ops/db-dump.sh, unless it is configuration that
 * the migrations themselves restore (allow-listed with a reason).
 */
describe("database parity: backups", () => {
  const notDumped: Record<string, string> = {
    "public.plans": "configuration owned by the migrations (ENT-01); restored with the schema",
  };
  const created = new Set<string>();
  const dropped = new Set<string>();
  for (const file of readdirSync(migrationsDir).sort()) {
    const sql = readFileSync(resolve(migrationsDir, file), "utf8");
    for (const m of sql.matchAll(/create table (?:if not exists )?(public\.\w+)/gi)) {
      created.add(m[1] as string);
    }
    for (const m of sql.matchAll(/drop table (?:if exists )?(public\.\w+)/gi)) {
      dropped.add(m[1] as string);
    }
  }
  const tables = [...created].filter((t) => !dropped.has(t)).sort();
  const dump = readFileSync(resolve(migrationsDir, "../../scripts/ops/db-dump.sh"), "utf8");
  const dumped = new Set(
    occurrences(dump, /--table=([\w.]+)/g).filter((t): t is string => t !== undefined),
  );

  it("ENV-08 every public table created in the migrations is in the backup dump or allow-listed", () => {
    expect(tables.length).toBeGreaterThan(0);
    expect(tables.filter((t) => !dumped.has(t) && !(t in notDumped))).toEqual([]);
  });

  it("ENV-08 the dump and the allow-list name only tables that exist", () => {
    const publicDumped = [...dumped].filter((t) => t.startsWith("public."));
    expect(publicDumped.filter((t) => !tables.includes(t))).toEqual([]);
    expect(Object.keys(notDumped).filter((t) => !tables.includes(t) || dumped.has(t))).toEqual([]);
  });
});
