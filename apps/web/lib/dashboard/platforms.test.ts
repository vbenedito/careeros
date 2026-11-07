import { describe, expect, it } from "vitest";
import { wholePercentages } from "./percent";
import { resolvePeriod } from "./period";
import { platformSlices } from "./platforms";
import { summarize } from "./summary";

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe("whole percentages (DASH-09)", () => {
  it("always sum to 100 (largest remainder)", () => {
    expect(wholePercentages([1, 1, 1])).toEqual([34, 33, 33]);
    expect(sum(wholePercentages([7, 13, 29, 101, 3, 3]))).toBe(100);
    for (let n = 1; n <= 7; n++) {
      const values = Array.from({ length: n }, (_, i) => ((i * 37 + 11) % 97) + 1);
      expect(sum(wholePercentages(values))).toBe(100);
    }
  });

  it("no time gives zeros", () => {
    expect(wholePercentages([0, 0])).toEqual([0, 0]);
    expect(wholePercentages([])).toEqual([]);
  });
});

describe("platform slices (DASH-09)", () => {
  const domains = ["a.com", "b.com", "c.com", "d.com", "e.com", "f.com", "g.com"].map(
    (domain, i) => ({ domain, seconds: (7 - i) * 600 }),
  );

  it("top 5 plus Other, with tokens, durations and percentages summing to 100", () => {
    const slices = platformSlices(domains);
    expect(slices.map((s) => s.name)).toEqual([
      "a.com",
      "b.com",
      "c.com",
      "d.com",
      "e.com",
      "Other",
    ]);
    expect(slices[5]).toMatchObject({ seconds: 1800, color: "var(--chart-6)" });
    expect(slices[0]?.color).toBe("var(--chart-1)");
    expect(slices[0]?.duration).toBeTruthy();
    expect(sum(slices.map((s) => s.percent))).toBe(100);
  });

  it("no Other with 5 domains or fewer; empty without time", () => {
    expect(platformSlices(domains.slice(0, 5)).map((s) => s.name)).not.toContain("Other");
    expect(platformSlices([{ domain: "a.com", seconds: 0 }])).toEqual([]);
  });

  it("the Top platform card shows the same share as the legend", () => {
    const d = [
      { domain: "a.com", seconds: 1 },
      { domain: "b.com", seconds: 1 },
      { domain: "c.com", seconds: 1 },
    ];
    const cards = summarize(
      { todaySeconds: 0, daily: [], domains: d, periodSeconds: 3 },
      resolvePeriod({}, "2026-11-07"),
    );
    const top = cards[2];
    expect(top && "share" in top ? top.share : null).toBe(platformSlices(d)[0]?.percent);
  });
});
