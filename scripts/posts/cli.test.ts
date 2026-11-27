import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCli } from "./cli.ts";
import { readRecords } from "./records.ts";

describe("PST-11 command line", () => {
  it("PST-11 --now is refused without --dry-run so a real run cannot freeze its clock", () => {
    expect(() => parseCli(["daily", "--now", "2026-11-27T12:00:00Z"], {})).toThrow(
      "--now must be used with --dry-run",
    );
    expect(() => parseCli(["publish", "--now", "2026-11-27T12:00:00Z"], {})).toThrow("must be");
    expect(parseCli(["daily", "--dry-run", "--now", "2026-11-27T12:00:00Z"], {}).nowGiven).toBe(
      true,
    );
    expect(parseCli(["cron-lines", "--now", "2026-11-27T12:00:00Z"], {}).nowGiven).toBe(true);
  });
  it("PST-23 the daily command takes the ops dir and repo", () => {
    const args = parseCli(["daily", "--ops-dir", "ops", "--ops-repo", "o/r", "--dry-run"], {});
    expect(args).toMatchObject({ command: "daily", opsDir: "ops", opsRepo: "o/r", dryRun: true });
  });
});

describe("PST-07 reading records", () => {
  it("PST-07 a checkout without a posts/ directory has no records", async () => {
    const dir = await mkdtemp(join(tmpdir(), "posts-empty-"));
    expect(await readRecords(dir)).toEqual([]);
  });
});
