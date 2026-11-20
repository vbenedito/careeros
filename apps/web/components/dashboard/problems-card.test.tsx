// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { problemRows } from "@/lib/problems/list";
import { ProblemsCard } from "./problems-card";

afterEach(cleanup);

const rows = problemRows([
  { domain: "leetcode.com", problem_slug: "two-sum", seconds: 4980, last_day: "2026-11-17" },
  { domain: "leetcode.com", problem_slug: "lru-cache", seconds: 1500, last_day: "2026-11-16" },
]);

describe("DASH-17 LeetCode problems card", () => {
  it("PRB-11 DASH-17 lists name, total time and last day, in the order given", () => {
    render(<ProblemsCard rows={rows} retryHref="/dashboard" />);
    expect(screen.getByRole("heading", { level: 2, name: "LeetCode problems" })).toBeTruthy();
    const items = within(screen.getByTestId("problems-list")).getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual([
      "Two Sum1h 23mTue, Nov 17",
      "Lru Cache25mMon, Nov 16",
    ]);
    expect(items[0]?.querySelector("time")?.getAttribute("datetime")).toBe("2026-11-17");
  });

  it("DASH-17 before 0.3.1 there is no subtitle and no site on the rows", () => {
    render(<ProblemsCard rows={rows} retryHref="/dashboard" />);
    expect(screen.queryByText(/NeetCode/)).toBeNull();
    expect(screen.getByTestId("problems-list").textContent).not.toContain("leetcode.com");
  });

  it("PRB-11 DASH-17 from 0.3.1: 'Coding problems', both sites in the subtitle, the site on each row", () => {
    const perSite = problemRows(
      [
        { domain: "leetcode.com", problem_slug: "two-sum", seconds: 1200, last_day: "2026-11-17" },
        { domain: "neetcode.io", problem_slug: "two-sum", seconds: 300, last_day: "2026-11-16" },
      ],
      true,
    );
    render(<ProblemsCard rows={perSite} retryHref="/dashboard" neetCode />);
    expect(screen.getByRole("heading", { level: 2, name: "Coding problems" })).toBeTruthy();
    expect(screen.getByText(/LeetCode and NeetCode/)).toBeTruthy();
    const items = within(screen.getByTestId("problems-list")).getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual([
      "Two Sum · leetcode.com20mTue, Nov 17",
      "Two Sum · neetcode.io5mMon, Nov 16",
    ]);
  });

  it("DASH-17 from 0.3.1 the empty and error texts say coding problems", () => {
    const { unmount } = render(<ProblemsCard rows={[]} retryHref="/dashboard" neetCode />);
    expect(screen.getByText("No coding problems in this period.")).toBeTruthy();
    unmount();
    render(<ProblemsCard rows={[]} error="temporary" retryHref="/dashboard" neetCode />);
    expect(screen.getByRole("alert").textContent).toContain("Couldn't load your coding problems");
  });

  it("DASH-17 an empty period says so", () => {
    render(<ProblemsCard rows={[]} retryHref="/dashboard" />);
    expect(screen.getByText("No LeetCode problems in this period.")).toBeTruthy();
    expect(screen.queryByTestId("problems-list")).toBeNull();
  });

  it("DASH-17 a temporary failure offers Try again for the same period", () => {
    render(<ProblemsCard rows={[]} error="temporary" retryHref="/dashboard?view=month" />);
    expect(screen.getByRole("alert").textContent).toContain("Couldn't load your LeetCode problems");
    expect(screen.getByRole("link", { name: "Try again" }).getAttribute("href")).toBe(
      "/dashboard?view=month",
    );
  });

  it("DASH-17 a permanent failure offers no retry", () => {
    render(<ProblemsCard rows={[]} error="permanent" retryHref="/dashboard" />);
    expect(screen.getByRole("alert").textContent).toContain("won't help");
    expect(screen.queryByRole("link", { name: "Try again" })).toBeNull();
  });
});
