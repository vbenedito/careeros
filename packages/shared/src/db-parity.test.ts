/**
 * The database domain type `public.hostname` must accept exactly what isValidDomain() accepts.
 * This test reads the migration and fails if the regex or limits drift apart.
 */
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DATA, SYNC, TRACKING } from "./constants";
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
  const parser = latestFunctionSql("private.parse_study_session");
  const ingest = latestFunctionSql("public.ingest_study_sessions");
  const spec = readFileSync(resolve(specsDir, "04-data-model.md"), "utf8");

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

  it("TEST-08 DATA-10 DATA-11 both totals functions accept at most 92 days, as the spec says", () => {
    for (const name of ["public.get_daily_totals", "public.get_domain_totals"]) {
      const { sql } = latestFunctionSql(name);
      expect(occurrences(sql, /p_to - p_from \+ 1 > (\d+)/g), name).toEqual(["92"]);
    }
    expect(spec).toContain("> 92 days");
  });

  it("TEST-08 DATA-01 the tracked-domain limit in the latest trigger equals MAX_TRACKED_DOMAINS", () => {
    const { sql } = latestFunctionSql("private.enforce_tracked_domain_limit");
    expect(occurrences(sql, /count\(\*\) from public\.tracked_domains[^;]*>= (\d+)/g)).toEqual([
      `${DATA.MAX_TRACKED_DOMAINS}`,
    ]);
    expect(sql).toContain(`at most ${DATA.MAX_TRACKED_DOMAINS} domains`);
  });
});
