import { describe, expect, it } from "vitest";
import { isValidDate, periodHref, resolvePeriod, weekStart } from "./period";

const TODAY = "2026-11-07"; // a Saturday

describe("dashboard period (DASH-04, DASH-05)", () => {
  it("DASH-04 defaults to the current week, Monday to Sunday", () => {
    const p = resolvePeriod({}, TODAY);
    expect(p).toMatchObject({
      view: "week",
      from: "2026-11-02",
      to: "2026-11-08",
      label: "This week",
      isCurrent: true,
      previous: "2026-10-26",
      next: null,
    });
    expect(p.days).toHaveLength(7);
  });

  it("DASH-04 weeks start on Monday, also when the date is a Sunday", () => {
    expect(weekStart("2026-11-08")).toBe("2026-11-02");
    expect(weekStart("2026-11-02")).toBe("2026-11-02");
  });

  it("DASH-04 past weeks have a label and a next link; labels across months and years", () => {
    expect(resolvePeriod({ view: "week", date: "2026-10-28" }, TODAY)).toMatchObject({
      label: "Oct 26 – Nov 1, 2026",
      isCurrent: false,
      next: "2026-11-02",
    });
    expect(resolvePeriod({ view: "week", date: "2026-10-14" }, TODAY).label).toBe(
      "Oct 12 – 18, 2026",
    );
    expect(resolvePeriod({ view: "week", date: "2025-12-31" }, TODAY).label).toBe(
      "Dec 29, 2025 – Jan 4, 2026",
    );
  });

  it("DASH-04 months: whole calendar month, leap years, label, navigation", () => {
    const current = resolvePeriod({ view: "month" }, TODAY);
    expect(current).toMatchObject({
      from: "2026-11-01",
      to: "2026-11-30",
      label: "This month",
      next: null,
    });
    expect(current.days).toHaveLength(30);
    const feb = resolvePeriod({ view: "month", date: "2028-02-10" }, "2028-05-01");
    expect(feb).toMatchObject({
      from: "2028-02-01",
      to: "2028-02-29",
      label: "Feb 2028",
      previous: "2028-01-01",
      next: "2028-03-01",
    });
    expect(resolvePeriod({ view: "month", date: "2026-01-15" }, TODAY).previous).toBe("2025-12-01");
  });

  it("DASH-05 invalid or future URL values fall back safely", () => {
    expect(resolvePeriod({ view: "year", date: "nope" }, TODAY)).toMatchObject({
      view: "week",
      isCurrent: true,
    });
    expect(resolvePeriod({ date: "2026-02-30" }, TODAY).isCurrent).toBe(true);
    expect(resolvePeriod({ date: "2030-01-01" }, TODAY).isCurrent).toBe(true); // clamped to today
    expect(isValidDate("2026-11-07")).toBe(true);
    expect(isValidDate("2026-13-01")).toBe(false);
  });

  it("DASH-05 periods are addressed by URL", () => {
    expect(periodHref("month", "2026-10-01")).toBe("/?view=month&date=2026-10-01");
  });
});
