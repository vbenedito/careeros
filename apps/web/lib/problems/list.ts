/**
 * The coding problems list (PRB-11, DASH-17) as a pure function of the `get_problem_totals_v2`
 * rows: one row per pair domain + slug (PRB-19), never summed across sites. The database already
 * sorts and caps; the same order is applied here, so the list does not depend on it.
 */
import { formatDuration, PROBLEMS, problemName } from "@careeros/shared";
import { shortenMiddle } from "./sites";

export interface ProblemRow {
  /** The site of the problem (PRB-19). */
  domain: string;
  slug: string;
  /** PRB-12 */
  name: string;
  /** What the row shows as its title: the name, plus ` · domain` when the site is shown (PRB-11). */
  title: string;
  seconds: number;
  /** EXT-UI-02 format, like the summary cards. */
  duration: string;
  /** `YYYY-MM-DD` in the viewer's time zone (DASH-07). */
  lastDay: string;
  /** "Tue, Nov 17" */
  lastDayLabel: string;
  /**
   * PSR-14: set for the id of a user rule (any domain that is not built in): the rule's label,
   * the id as it is and the id shortened in the middle for small screens (full id in a tooltip).
   */
  userRule: { label: string; id: string; shortId: string } | null;
}

export interface ProblemTotalRow {
  domain: string;
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

/** Byte-order comparison (A-Z), like the database's "C" collation. */
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * PRB-11: longest first, ties by domain (A-Z), then slug (A-Z); at most PROBLEM_LIST_MAX rows.
 * `showSite` is true from extension 0.3.1 (NeetCode copy gate): the site is shown on the row.
 */
export function problemRows(
  rows: readonly ProblemTotalRow[],
  showSite = false,
  /** PSR-14: domain → label of the user's rules. */
  labels: ReadonlyMap<string, string> = new Map(),
): ProblemRow[] {
  return rows
    .map((r) => ({ r, seconds: Number(r.seconds) }))
    .sort(
      (a, b) =>
        b.seconds - a.seconds ||
        compare(a.r.domain, b.r.domain) ||
        compare(a.r.problem_slug, b.r.problem_slug),
    )
    .slice(0, PROBLEMS.PROBLEM_LIST_MAX)
    .map(({ r, seconds }) => {
      const builtIn = (PROBLEMS.PROBLEM_DOMAINS as readonly string[]).includes(r.domain);
      if (!builtIn) {
        // PRB-12, PSR-14: label + the id as it is; CareerOS never fetches the page title. After
        // "Remove and keep history" there is no rule left: the label is the domain.
        const label = labels.get(r.domain) ?? r.domain;
        return {
          domain: r.domain,
          slug: r.problem_slug,
          name: r.problem_slug,
          title: `${label} · ${r.problem_slug}`,
          seconds,
          duration: formatDuration(seconds),
          lastDay: r.last_day,
          lastDayLabel: formatLastDay(r.last_day),
          userRule: { label, id: r.problem_slug, shortId: shortenMiddle(r.problem_slug) },
        };
      }
      const name = problemName(r.problem_slug);
      return {
        domain: r.domain,
        slug: r.problem_slug,
        name,
        title: showSite ? `${name} · ${r.domain}` : name,
        seconds,
        duration: formatDuration(seconds),
        lastDay: r.last_day,
        lastDayLabel: formatLastDay(r.last_day),
        userRule: null,
      };
    });
}
