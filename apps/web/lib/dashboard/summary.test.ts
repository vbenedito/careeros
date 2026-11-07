import { describe, expect, it } from "vitest";
import type { DashboardData } from "./data";
import { resolvePeriod } from "./period";
import { summarize } from "./summary";

const data = (over: Partial<DashboardData> = {}): DashboardData => ({
  todaySeconds: 600,
  daily: [],
  domains: [
    { domain: "neetcode.io", seconds: 1800 },
    { domain: "leetcode.com", seconds: 600 },
  ],
  periodSeconds: 2400,
  ...over,
});

describe("summary cards (DASH-06)", () => {
  it("DASH-06 today, the selected period titled 'This week', and the top platform with its share", () => {
    const cards = summarize(data(), resolvePeriod({}, "2026-11-07"));
    expect(cards).toEqual([
      { id: "today", title: "Today", seconds: 600, detail: null },
      { id: "period", title: "This week", seconds: 2400, detail: null },
      { id: "top", title: "Top platform", seconds: 1800, detail: "neetcode.io · 75%" },
    ]);
  });

  it("DASH-06 a past period is titled with its label; no data shows —", () => {
    const period = resolvePeriod({ view: "month", date: "2026-10-01" }, "2026-11-07");
    const cards = summarize(data({ domains: [], periodSeconds: 0 }), period);
    expect(cards[1]?.title).toBe("Oct 2026");
    expect(cards[2]).toEqual({ id: "top", title: "Top platform", seconds: null, detail: null });
  });
});
