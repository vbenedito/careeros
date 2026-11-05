/**
 * The database domain type `public.hostname` must accept exactly what isValidDomain() accepts.
 * This test reads the migration and fails if the regex or limits drift apart.
 */
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DATA } from "./constants";
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
