import { describe, expect, it } from "vitest";
import { checkFile, checkFiles, formatResults, parseArgs, parseSlugs } from "./validate-lib.ts";

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
    expect(parseArgs(["--slugs", "s.json", "--post-time", "20:30", "a.json"]).postTime).toBe(
      "20:30",
    );
    expect(() => parseArgs(["--slugs", "s.json", "--post-time", "25:00", "a.json"])).toThrow(
      "HH:MM",
    );
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

  it("PST-09 fails two records in one call that share a slug", () => {
    const record = (date: string) => {
      const stem = `${date}-same-idea`;
      return JSON.stringify({
        schema: 1,
        slug: "same-idea",
        date,
        time: "19:00",
        timezone: "America/Sao_Paulo",
        pillar: "p",
        format: "f",
        video: { release: `post-${stem}`, asset: `${stem}.mp4`, sha256: "a".repeat(64) },
        music_license: "m",
        ai_label: false,
        platforms: {},
      });
    };
    const context = { existingSlugs: [], now: new Date("2029-12-01T00:00:00Z") };
    const one = { path: "posts/2030/2030-01-01-same-idea.json", text: record("2030-01-01") };
    const two = { path: "posts/2030/2030-01-03-same-idea.json", text: record("2030-01-03") };
    expect(checkFiles([one], context)[0]?.failures).toEqual([]);
    const results = checkFiles([one, two], context);
    expect(results.map((r) => r.failures.map((f) => f.code))).toEqual([
      ["duplicate-slug"],
      ["duplicate-slug"],
    ]);
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
