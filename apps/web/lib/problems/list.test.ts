import { describe, expect, it } from "vitest";
import { formatLastDay, problemRows } from "./list";

describe("LeetCode problems list (PRB-11, DASH-17)", () => {
  it("PRB-11 DASH-17 one row per problem: name from the slug, formatted time, last day", () => {
    const rows = problemRows([
      { problem_slug: "two-sum", seconds: 4980, last_day: "2026-11-17" },
      { problem_slug: "3sum", seconds: "1200", last_day: "2026-11-15" },
    ]);
    expect(rows).toEqual([
      {
        slug: "two-sum",
        name: "Two Sum",
        seconds: 4980,
        duration: "1h 23m",
        lastDay: "2026-11-17",
        lastDayLabel: "Tue, Nov 17",
      },
      {
        slug: "3sum",
        name: "3sum",
        seconds: 1200,
        duration: "20m",
        lastDay: "2026-11-15",
        lastDayLabel: "Sun, Nov 15",
      },
    ]);
  });

  it("PRB-11 keeps the order the database sends (longest first, ties by slug)", () => {
    const rows = problemRows([
      { problem_slug: "b", seconds: 600, last_day: "2026-11-02" },
      { problem_slug: "a", seconds: 600, last_day: "2026-11-02" },
    ]);
    expect(rows.map((r) => r.slug)).toEqual(["b", "a"]);
  });

  it("PRB-11 an empty period gives no rows", () => {
    expect(problemRows([])).toEqual([]);
  });

  it("DASH-17 the last day reads like 'Tue, Nov 17' whatever the server's zone", () => {
    expect(formatLastDay("2026-11-17")).toBe("Tue, Nov 17");
    expect(formatLastDay("2026-01-01")).toBe("Thu, Jan 1");
  });
});
