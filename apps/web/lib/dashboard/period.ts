/**
 * Dashboard period (DASH-04/05): a week (Monday start) or a calendar month, addressed by
 * `?view=week|month&date=YYYY-MM-DD` (any day inside the period). Pure: dates are plain
 * `YYYY-MM-DD` strings in the viewer's time zone; arithmetic runs on UTC calendar dates, so
 * DST never shifts a day.
 */

export type View = "week" | "month";

export interface Period {
  view: View;
  /** First and last day, inclusive. */
  from: string;
  to: string;
  days: string[];
  /** "This week", "This month", or e.g. "Nov 2 – 8, 2026" / "Oct 2026". */
  label: string;
  isCurrent: boolean;
  /** `date` values for navigation; `next` is null beyond the current period (DASH-04). */
  previous: string;
  next: string | null;
  /** The canonical `date` of this period (its first day). */
  anchor: string;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

const toUtc = (d: string) =>
  Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
const fromUtc = (t: number) => new Date(t).toISOString().slice(0, 10);
const addDays = (d: string, n: number) => fromUtc(toUtc(d) + n * DAY_MS);

/**
 * A real calendar date in YYYY-MM-DD form (rejects 2026-02-30), from year 1000: Date.UTC maps
 * years 0–99 to 1900+, which would turn a week near year 100 into a 1,900-year range (#111).
 */
export function isValidDate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    DATE.test(value) &&
    value >= "1000-01-01" &&
    fromUtc(toUtc(value)) === value
  );
}

/** Monday of the week containing `d`. */
export function weekStart(d: string): string {
  const weekday = new Date(toUtc(d)).getUTCDay(); // 0 = Sunday
  return addDays(d, -((weekday + 6) % 7));
}

function monthStart(d: string): string {
  return `${d.slice(0, 8)}01`;
}

function monthEnd(d: string): string {
  const y = Number(d.slice(0, 4));
  const m = Number(d.slice(5, 7));
  return fromUtc(Date.UTC(y, m, 0)); // day 0 of the next month
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthName = (d: string) => MONTHS[Number(d.slice(5, 7)) - 1] ?? "";
const day = (d: string) => Number(d.slice(8, 10));
const year = (d: string) => d.slice(0, 4);

function weekLabel(from: string, to: string): string {
  if (year(from) !== year(to)) {
    return `${monthName(from)} ${day(from)}, ${year(from)} – ${monthName(to)} ${day(to)}, ${year(to)}`;
  }
  if (monthName(from) !== monthName(to)) {
    return `${monthName(from)} ${day(from)} – ${monthName(to)} ${day(to)}, ${year(to)}`;
  }
  return `${monthName(from)} ${day(from)} – ${day(to)}, ${year(to)}`;
}

/**
 * Builds the period from URL search params and today's date (viewer's zone). Anything invalid
 * falls back to the current week; a date in the future clamps to the current period.
 */
export function resolvePeriod(params: { view?: unknown; date?: unknown }, today: string): Period {
  const view: View = params.view === "month" ? "month" : "week";
  let date = isValidDate(params.date) ? params.date : today;
  if (date > today) date = today;

  const from = view === "week" ? weekStart(date) : monthStart(date);
  const to = view === "week" ? addDays(from, 6) : monthEnd(date);
  const currentFrom = view === "week" ? weekStart(today) : monthStart(today);
  const isCurrent = from === currentFrom;

  const days: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);

  const previous = view === "week" ? addDays(from, -7) : monthStart(addDays(from, -1));
  const following = view === "week" ? addDays(from, 7) : addDays(to, 1);

  const label = isCurrent
    ? view === "week"
      ? "This week"
      : "This month"
    : view === "week"
      ? weekLabel(from, to)
      : `${monthName(from)} ${year(from)}`;

  return {
    view,
    from,
    to,
    days,
    label,
    isCurrent,
    previous,
    next: following > today ? null : following,
    anchor: from,
  };
}

/** URL for a period (DASH-05). */
export function periodHref(view: View, date: string): string {
  return `/dashboard?view=${view}&date=${date}`;
}
