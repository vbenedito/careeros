import { describe, expect, it } from "vitest";
import { segmentLengths } from "./chart-geometry";

const sum = (a: number[]) => a.reduce((n, v) => n + v, 0);

describe("chart geometry (ADM-20)", () => {
  it("ADM-20 shares are proportional and add up to the stack length", () => {
    const l = segmentLengths([1, 3], 40, 2);
    expect(l).toEqual([10, 30]);
  });

  it("ADM-20 a tiny segment keeps the minimum size and the rest give way", () => {
    const l = segmentLengths([1, 500, 500], 100, 3);
    expect(l[0]).toBe(3);
    expect(l[1]).toBeCloseTo(48.5);
    expect(sum(l)).toBeCloseTo(100);
  });

  it("ADM-20 a zero value gets no length; a stack of tiny values grows to fit", () => {
    expect(segmentLengths([0, 5, 0], 50, 3)).toEqual([0, 50, 0]);
    expect(segmentLengths([0, 0], 50, 3)).toEqual([0, 0]);
    const l = segmentLengths([1, 1, 1], 1, 3);
    expect(l).toEqual([3, 3, 3]);
  });
});
