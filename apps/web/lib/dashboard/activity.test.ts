import { describe, expect, it } from "vitest";
import { activityBars, formatMinutesTick } from "./activity";
import { resolvePeriod } from "./period";

const TODAY = "2026-11-07"; // Saturday

describe("study activity chart data (DASH-08)", () => {
  it("DASH-08 week: 7 bars Mon–Sun, minutes, today highlighted, tooltip with date and duration", () => {
    const bars = activityBars(
      [
        { day: "2026-11-03", seconds: 3900 },
        { day: "2026-11-07", seconds: 600 },
      ],
      resolvePeriod({}, TODAY),
      TODAY,
    );
    expect(bars.map((b) => b.label)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    expect(bars[1]).toMatchObject({ minutes: 65, isToday: false, tooltip: "Tue, Nov 3 · 1h 05m" });
    expect(bars.filter((b) => b.isToday).map((b) => b.day)).toEqual(["2026-11-07"]);
    expect(bars[6]).toMatchObject({ minutes: 0, tooltip: "Sun, Nov 8 · 0m" });
  });

  it("DASH-08 month: one bar per day labelled by day number", () => {
    const bars = activityBars(
      [],
      resolvePeriod({ view: "month", date: "2026-02-10" }, TODAY),
      TODAY,
    );
    expect(bars).toHaveLength(28);
    expect(bars[0]?.label).toBe("1");
    expect(bars[27]?.label).toBe("28");
  });

  it("DASH-08 today is highlighted only when it is inside the period", () => {
    const past = activityBars([], resolvePeriod({ date: "2026-10-28" }, TODAY), TODAY);
    expect(past.some((b) => b.isToday)).toBe(false);
  });

  it("y-axis ticks read as durations", () => {
    expect(formatMinutesTick(30)).toBe("30m");
    expect(formatMinutesTick(60)).toBe("1h 00m");
  });
});
