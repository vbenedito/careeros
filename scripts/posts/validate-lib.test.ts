import { describe, expect, it } from "vitest";
import { checkFile, formatResults, parseArgs, parseSlugs } from "./validate-lib.ts";

describe("posts validate CLI (PST-09)", () => {
  it("PST-09 parses options and files, and rejects a bad call", () => {
    const args = parseArgs([
      "--slugs",
      "s.json",
      "--skip-past",
      "--now",
      "2030-01-01T00:00:00Z",
      "a.json",
      "b.json",
    ]);
    expect(args.files).toEqual(["a.json", "b.json"]);
    expect(args.skipPast).toBe(true);
    expect(args.now?.toISOString()).toBe("2030-01-01T00:00:00.000Z");
    expect(() => parseArgs(["a.json"])).toThrow("--slugs");
    expect(() => parseArgs(["--slugs", "s.json"])).toThrow("at least one");
    expect(() => parseArgs(["--slugs", "s.json", "--bogus", "a.json"])).toThrow("unknown option");
    expect(() => parseArgs(["--slugs", "s.json", "--now", "nope", "a.json"])).toThrow("ISO");
  });

  it("PST-09 reads the slugs file and checks one file's text", () => {
    expect(parseSlugs('["a-b"]')).toEqual(["a-b"]);
    expect(() => parseSlugs('{"a":1}')).toThrow("array of strings");
    const context = { existingSlugs: [], now: new Date("2030-01-01T00:00:00Z") };
    expect(checkFile("posts/2030/x.json", "{oops", context).failures[0]?.message).toContain("JSON");
    expect(checkFile("posts/2030/x.json", "{}", context).failures.length).toBeGreaterThan(0);
  });

  it("PST-09 prints a short result per file and a summary", () => {
    const text = formatResults([
      { path: "a.json", failures: [] },
      { path: "b.json", failures: [{ code: "link", message: "bad", platform: "tiktok" }] },
    ]);
    expect(text).toBe("OK   a.json\nFAIL b.json\n  - [link] (tiktok) bad\n1 of 2 record(s) failed");
    expect(formatResults([{ path: "a.json", failures: [] }])).toContain("1 record(s) valid");
  });
});
