import { describe, expect, it } from "vitest";
import { agent, session } from "./fixtures";
import { buildSkills } from "./skills-view";

const rec = (kind: "code" | "ideas" | "docs" | "marketing" | "video" | "post", skills: string[]) =>
  agent({ kind, skills });

describe("skills view (ADM-19)", () => {
  it("ADM-19 six kinds in the fixed order, an empty kind says No records and is not hidden", () => {
    const view = buildSkills([session({ agents: [rec("docs", ["a"])] })]);
    expect(view.kinds.map((k) => k.kind)).toEqual([
      "code",
      "ideas",
      "docs",
      "marketing",
      "video",
      "post",
    ]);
    expect(view.kinds.map((k) => k.label)).toEqual([
      "Code",
      "Ideas",
      "Docs",
      "Marketing",
      "Video",
      "Post",
    ]);
    expect(view.kinds.find((k) => k.kind === "video")).toMatchObject({ records: 0, bars: [] });
  });

  it("ADM-19 a ledger with skills in all six kinds: top 3, Other and No skill listed per kind", () => {
    const agents = [
      ...["a", "a", "a", "b", "b", "c", "d", "e", "e"].map((s) => rec("code", [s])),
      rec("code", []),
      rec("code", []),
      ...(["ideas", "docs", "marketing", "video", "post"] as const).map((k) => rec(k, [`s-${k}`])),
    ];
    const view = buildSkills([session({ agents })]);
    const code = view.kinds[0];
    // a 3, b 2, e 2 (tie by name b < e), then c 1 + d 1 = Other 2, then 2 without a skill.
    expect(code?.bars).toEqual([
      { label: "a", count: 3, neutral: false },
      { label: "b", count: 2, neutral: false },
      { label: "e", count: 2, neutral: false },
      { label: "Other", count: 2, neutral: true },
      { label: "No skill listed", count: 2, neutral: true },
    ]);
    expect(code?.records).toBe(11);
    for (const k of view.kinds.slice(1)) {
      expect(k.bars).toEqual([{ label: `s-${k.kind}`, count: 1, neutral: false }]);
    }
    expect(view.max).toBe(3);
  });

  it("ADM-19 ties are sorted by name A to Z; Other and No skill listed appear only above 0", () => {
    const view = buildSkills([
      session({ agents: [rec("code", ["z"]), rec("code", ["m"]), rec("code", ["a"])] }),
    ]);
    expect(view.kinds[0]?.bars.map((b) => b.label)).toEqual(["a", "m", "z"]);
  });

  it("ADM-19 counts agent records, not skills used: a skill listed twice in one record counts once", () => {
    const view = buildSkills([
      session({ agents: [rec("code", ["a", "a"]), rec("code", ["a", "b"])] }),
    ]);
    expect(view.kinds[0]?.bars).toEqual([
      { label: "a", count: 2, neutral: false },
      { label: "b", count: 1, neutral: false },
    ]);
  });

  it("ADM-19 a corrects file replaces the session it names", () => {
    const old = session({ session: "2030-01-01-a", agents: [rec("code", ["old"])] });
    const fix = session({
      session: "2030-01-01-b",
      corrects: "2030-01-01-a",
      agents: [rec("code", ["new"])],
    });
    expect(buildSkills([old, fix]).kinds[0]?.bars.map((b) => b.label)).toEqual(["new"]);
  });

  it("ADM-19 headline: the most used skill with its count and kind; ties by name, then kind order", () => {
    const view = buildSkills([
      session({
        agents: [rec("code", ["x"]), rec("code", ["x"]), rec("docs", ["x"]), rec("docs", ["x"])],
      }),
    ]);
    expect(view.headline).toBe("Most used: x (2 records, code)");
    const byName = buildSkills([
      session({
        agents: [rec("docs", ["a"]), rec("code", ["b"]), rec("code", ["b"]), rec("docs", ["a"])],
      }),
    ]);
    expect(byName.headline).toBe("Most used: a (2 records, docs)");
    expect(buildSkills([session({ agents: [rec("post", ["only"])] })]).headline).toBe(
      "Most used: only (1 record, post)",
    );
  });

  it("ADM-19 empty: no record lists a skill", () => {
    expect(buildSkills([]).empty).toBe(true);
    expect(buildSkills([session({ agents: [rec("code", [])] })]).empty).toBe(true);
    expect(buildSkills([session({ agents: [rec("code", ["a"])] })]).empty).toBe(false);
  });

  it("ADM-19 the Details table lists every skill, alphabetical within a kind", () => {
    const view = buildSkills([
      session({
        agents: [
          rec("code", ["zeta"]),
          rec("code", ["alpha"]),
          rec("code", ["alpha"]),
          rec("code", ["m", "n", "o"]),
          rec("ideas", ["b"]),
        ],
      }),
    ]);
    // Every skill, then "Other" (the rest after the top 3: here 2) as the bars show it.
    expect(view.table.filter((r) => r.kind === "Code").map((r) => [r.skill, r.records])).toEqual([
      ["alpha", 2],
      ["m", 1],
      ["n", 1],
      ["o", 1],
      ["zeta", 1],
      ["Other", 2],
    ]);
    // Kinds without records and records without skills are in the table too.
    expect(view.table.filter((r) => r.kind === "Video")).toEqual([
      { kind: "Video", skill: "No records", records: 0 },
    ]);
    const none = buildSkills([session({ agents: [rec("code", ["a"]), rec("code", [])] })]);
    expect(none.table).toContainEqual({ kind: "Code", skill: "No skill listed", records: 1 });
    expect(view.table.find((r) => r.kind === "Ideas")).toEqual({
      kind: "Ideas",
      skill: "b",
      records: 1,
    });
  });
});
