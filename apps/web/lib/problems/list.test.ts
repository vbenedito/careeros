import { PROBLEMS } from "@careeros/shared";
import { describe, expect, it } from "vitest";
import { formatLastDay, problemRows } from "./list";

const row = (
  domain: string,
  problem_slug: string,
  seconds: number | string,
  last_day = "2026-11-17",
) => ({
  domain,
  problem_slug,
  seconds,
  last_day,
});

describe("coding problems list (PRB-11, DASH-17)", () => {
  it("PRB-11 DASH-17 one row per problem: name from the slug, formatted time, last day", () => {
    const rows = problemRows([
      row("leetcode.com", "two-sum", 4980),
      row("leetcode.com", "3sum", "1200", "2026-11-15"),
    ]);
    expect(rows).toEqual([
      {
        domain: "leetcode.com",
        slug: "two-sum",
        name: "Two Sum",
        title: "Two Sum",
        seconds: 4980,
        duration: "1h 23m",
        lastDay: "2026-11-17",
        lastDayLabel: "Tue, Nov 17",
        userRule: null,
      },
      {
        domain: "leetcode.com",
        slug: "3sum",
        name: "3sum",
        title: "3sum",
        seconds: 1200,
        duration: "20m",
        lastDay: "2026-11-15",
        lastDayLabel: "Sun, Nov 15",
        userRule: null,
      },
    ]);
  });

  it("PRB-11 acceptance 10 the same slug on two sites is two rows, never summed: 20, 7, 5 min", () => {
    const rows = problemRows(
      [
        row("neetcode.io", "two-sum", 5 * 60),
        row("leetcode.com", "valid-anagram", 7 * 60),
        row("leetcode.com", "two-sum", 20 * 60),
      ],
      true,
    );
    expect(rows.map((r) => [r.title, r.duration])).toEqual([
      ["Two Sum · leetcode.com", "20m"],
      ["Valid Anagram · leetcode.com", "7m"],
      ["Two Sum · neetcode.io", "5m"],
    ]);
  });

  it("PRB-11 ties are broken by domain (A-Z), then slug (A-Z), whatever the input order", () => {
    const rows = problemRows([
      row("neetcode.io", "a", 600),
      row("leetcode.com", "b", 600),
      row("leetcode.com", "a", 600),
    ]);
    expect(rows.map((r) => `${r.domain}/${r.slug}`)).toEqual([
      "leetcode.com/a",
      "leetcode.com/b",
      "neetcode.io/a",
    ]);
  });

  it("PRB-11 shows the site on the row only when asked (NeetCode copy gate, ENV-05c)", () => {
    const data = [row("leetcode.com", "two-sum", 60)];
    expect(problemRows(data)[0]?.title).toBe("Two Sum");
    expect(problemRows(data, true)[0]?.title).toBe("Two Sum · leetcode.com");
  });

  it("PRB-11 at most PROBLEM_LIST_MAX rows", () => {
    const many = Array.from({ length: PROBLEMS.PROBLEM_LIST_MAX + 5 }, (_, i) =>
      row("leetcode.com", `p${i}`, 1000 - i),
    );
    expect(problemRows(many)).toHaveLength(PROBLEMS.PROBLEM_LIST_MAX);
  });

  it("PRB-11 an empty period gives no rows", () => {
    expect(problemRows([])).toEqual([]);
  });

  it("DASH-17 the last day reads like 'Tue, Nov 17' whatever the server's zone", () => {
    expect(formatLastDay("2026-11-17")).toBe("Tue, Nov 17");
    expect(formatLastDay("2026-01-01")).toBe("Thu, Jan 1");
  });
});

describe("user-rule rows (PRB-12, PSR-14, DASH-17)", () => {
  const id = "cmlz26cxp08st08adxvy89hr1";

  it("PSR-14 a user rule row is the label and the id as it is, never a title built from the id", () => {
    const [r] = problemRows(
      [row("hellointerview.com", id, 600)],
      true,
      new Map([["hellointerview.com", "System design"]]),
    );
    expect(r?.title).toBe(`System design · ${id}`);
    expect(r?.name).toBe(id);
    expect(r?.userRule).toEqual({ label: "System design", id, shortId: "cmlz26cx…vy89hr1" });
  });

  it("PSR-14 after Remove and keep history there is no label left: the row shows the domain", () => {
    const [r] = problemRows([row("hellointerview.com", id, 60)]);
    expect(r?.title).toBe(`hellointerview.com · ${id}`);
  });

  it("PRB-12 a built-in row keeps the name built from the slug", () => {
    const [r] = problemRows(
      [row("leetcode.com", "two-sum", 60)],
      false,
      new Map([["leetcode.com", "Ignored"]]),
    );
    expect(r?.title).toBe("Two Sum");
    expect(r?.userRule).toBeNull();
  });

  it("PSR-14 a mixed list stays longest first across built-in and user rows", () => {
    const rows = problemRows(
      [row("leetcode.com", "two-sum", 60), row("hellointerview.com", id, 120)],
      true,
      new Map([["hellointerview.com", "HI"]]),
    );
    expect(rows.map((r) => r.title)).toEqual([`HI · ${id}`, "Two Sum · leetcode.com"]);
  });
});
