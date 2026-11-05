/**
 * Guards against drift between code constants and the spec tables (the source of truth).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PROTOCOL_VERSION, SYNC, TRACKING } from "./constants";

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
  });

  it("AUTH-07a protocol version starts at 1", () => {
    expect(PROTOCOL_VERSION).toBe(1);
  });
});
