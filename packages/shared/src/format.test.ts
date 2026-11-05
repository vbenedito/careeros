import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { formatDuration } from "./format";

describe("formatDuration", () => {
  it.each([
    [0, "0m"],
    [1, "<1m"],
    [59, "<1m"],
    [60, "1m"],
    [45 * 60 + 59, "45m"],
    [3600, "1h 00m"],
    [3600 + 5 * 60, "1h 05m"],
    [12 * 3600 + 30 * 60, "12h 30m"],
    [100 * 3600, "100h 00m"],
  ])("EXT-UI-02 formats %i s as %s", (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected);
  });

  it("treats negative and non-finite input as zero", () => {
    expect(formatDuration(-5)).toBe("0m");
    expect(formatDuration(Number.NaN)).toBe("0m");
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe("0m");
  });

  it("never rounds up (property)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 60, max: 10_000_000 }), (s) => {
        const match = /^(?:(\d+)h )?(\d+)m$/.exec(formatDuration(s));
        if (!match) return false;
        const shown = Number(match[1] ?? 0) * 3600 + Number(match[2]) * 60;
        return shown <= s && s - shown < 60;
      }),
    );
  });
});
