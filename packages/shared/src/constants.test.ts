/**
 * Guards against drift between code constants and the spec tables (the source of truth).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DATA, PROTOCOL_VERSION, SYNC, TRACKING } from "./constants";

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
});
