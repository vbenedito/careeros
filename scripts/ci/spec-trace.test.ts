import { describe, expect, it } from "vitest";
import {
  extractDefinedIds,
  extractSqlDescriptions,
  extractTestTitles,
  findIds,
  hasFailures,
  prefixesOf,
  renderSummary,
  trace,
} from "./spec-trace";

const prefixes = new Set(["TRK", "AUTH", "EXT-UI", "SYNC"]);

describe("TEST-02 spec-ID extraction", () => {
  it("TEST-02 defined IDs are the bold markers, with suffixes and multi-part prefixes", () => {
    const md = [
      "- **TRK-05** A rule. See TRK-06 and **not an id**.",
      "- **AUTH-10a** Suffix.",
      "- **EXT-UI-05c** Multi-part prefix.",
      "Plain TRK-07 text is a reference, not a definition.",
      "- **TRK-05** repeated once more.",
    ].join("\n");
    expect(extractDefinedIds(md)).toEqual(["TRK-05", "AUTH-10a", "EXT-UI-05c"]);
  });

  it("TEST-02 prefixes are derived from the defined IDs", () => {
    expect([...prefixesOf(["TRK-05", "AUTH-10a", "EXT-UI-05c"])].sort()).toEqual([
      "AUTH",
      "EXT-UI",
      "TRK",
    ]);
  });

  it("TEST-02 IDs in a title: suffixes, several per title, unknown prefixes ignored", () => {
    expect(findIds("SYNC-02b retry after TRK-05 (GMT-14, UTF-8)", prefixes)).toEqual([
      "SYNC-02b",
      "TRK-05",
    ]);
    expect(findIds("EXT-UI-05c popup", prefixes)).toEqual(["EXT-UI-05c"]);
  });

  it("TEST-02 malformed IDs (one digit, upper-case suffix) are kept so they are reported", () => {
    expect(findIds("TRK-5 and TRK-05A", prefixes)).toEqual(["TRK-5", "TRK-05A"]);
  });

  it("TEST-02 test titles: it/test/describe, modifiers, .each, template literals, next line", () => {
    const source = [
      'describe("TRK-01 group", () => {',
      '  it("TRK-02 a", () => {});',
      "  test.skip('TRK-03 b', () => {});",
      "  it.each([1, 2])(`TRK-04 at width`, () => {});",
      "  it.each([[1], [2]])(",
      '    "TRK-05 each",',
      "    () => {},",
      "  );",
      "  it(",
      '    "TRK-06 title on the next line",',
      "    () => {},",
      "  );",
      '  const x = "TRK-99 not a test title";',
      "  // TRK-98 comment",
      "});",
    ].join("\n");
    expect(extractTestTitles(source)).toEqual([
      "TRK-01 group",
      "TRK-02 a",
      "TRK-03 b",
      "TRK-04 at width",
      "TRK-05 each",
      "TRK-06 title on the next line",
    ]);
  });

  it("TEST-02 pgTAP descriptions: quoted strings, not comments, '' unescaped", () => {
    const sql = [
      "-- TRK-90: a comment",
      "select ok(true,",
      "  'SYNC-04 a retry isn''t an overlap');",
      "select is(1, 1, 'TRK-05 one');",
    ].join("\n");
    expect(extractSqlDescriptions(sql)).toEqual(["SYNC-04 a retry isn't an overlap", "TRK-05 one"]);
  });
});

describe("TEST-02 traceability result", () => {
  const defined = new Set(["TRK-01", "TRK-02", "TRK-03", "ENV-01"]);
  const referenced = new Map([["TRK-01", ["a.test.ts"]]]);

  it("TEST-02 untested IDs are a warning, not a failure", () => {
    const result = trace({ defined, referenced, allowlist: { "ENV-01": "decision" } });
    expect(result.tested).toEqual(["TRK-01"]);
    expect(result.allowlisted).toEqual(["ENV-01"]);
    expect(result.untested).toEqual(["TRK-02", "TRK-03"]);
    expect(hasFailures(result)).toBe(false);
  });

  it("TEST-02 an ID referenced by a test but defined nowhere fails", () => {
    const withTypo = new Map([...referenced, ["TRK-77", ["b.test.ts"]]]);
    const result = trace({ defined, referenced: withTypo, allowlist: {} });
    expect(result.unknown).toEqual([{ id: "TRK-77", files: ["b.test.ts"] }]);
    expect(hasFailures(result)).toBe(true);
  });

  it("TEST-02 an allow-listed ID that gained a test fails", () => {
    const result = trace({ defined, referenced, allowlist: { "TRK-01": "reason" } });
    expect(result.allowlistedButTested).toEqual(["TRK-01"]);
    expect(hasFailures(result)).toBe(true);
  });

  it("TEST-02 an allow-listed ID that no longer exists, or has no reason, fails", () => {
    const gone = trace({ defined, referenced, allowlist: { "TRK-50": "reason" } });
    expect(gone.allowlistedUnknown).toEqual(["TRK-50"]);
    expect(hasFailures(gone)).toBe(true);
    const bare = trace({ defined, referenced, allowlist: { "ENV-01": " " } });
    expect(bare.allowlistWithoutReason).toEqual(["ENV-01"]);
    expect(hasFailures(bare)).toBe(true);
  });

  it("TEST-02 the CI summary has the four counts", () => {
    const result = trace({ defined, referenced, allowlist: { "ENV-01": "decision" } });
    const summary = renderSummary(result, defined.size);
    expect(summary).toContain("| 4 | 1 | 1 | 2 |");
    expect(summary).toContain("Untested: TRK-02, TRK-03");
  });
});
