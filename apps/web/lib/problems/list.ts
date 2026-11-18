/**
 * The LeetCode problems list (PRB-11, DASH-17) as a pure function of the `get_problem_totals`
 * rows. The database already sorts (longest first, ties by slug) and caps the list; the order is
 * kept as it comes.
 */
import { formatDuration, problemName } from "@careeros/shared";

export interface ProblemRow {
  slug: string;
  /** PRB-12 */
  name: string;
  seconds: number;
  /** EXT-UI-02 format, like the summary cards. */
  duration: string;
  /** `YYYY-MM-DD` in the viewer's time zone (DASH-07). */
  lastDay: string;
  /** "Tue, Nov 17" */
  lastDayLabel: string;
}

export interface ProblemTotalRow {
  problem_slug: string;
  seconds: number | string;
  last_day: string;
}

/** "Tue, Nov 17" for a `YYYY-MM-DD` calendar day; no time zone shift is involved. */
export function formatLastDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function problemRows(rows: readonly ProblemTotalRow[]): ProblemRow[] {
  return rows.map((r) => {
    const seconds = Number(r.seconds);
    return {
      slug: r.problem_slug,
      name: problemName(r.problem_slug),
      seconds,
      duration: formatDuration(seconds),
      lastDay: r.last_day,
      lastDayLabel: formatLastDay(r.last_day),
    };
  });
}
