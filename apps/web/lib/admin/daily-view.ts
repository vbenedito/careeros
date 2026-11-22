/**
 * ADM-10a: view model of the agent cost chart (tokens per day by model, last 14 days). Pure
 * functions; the component only draws. Source: the ledger only, after `corrects` is applied.
 */
import { LEDGER_MODELS, type LedgerModel, type LedgerSession } from "@careeros/shared";
import { effectiveSessions } from "./effective";
import { formatTokens } from "./sessions-view";

export const CHART_DAYS = 14;
/** "Today" is the current date in this zone (ADM-10a). Brazil has no daylight saving time. */
export const ADMIN_TIME_ZONE = "America/Sao_Paulo";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The calendar date of `now` in `America/Sao_Paulo`, as `YYYY-MM-DD`. */
export function adminToday(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ADMIN_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** `YYYY-MM-DD` plus `days` (may be negative), in plain calendar arithmetic. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "21 Nov": the written form of a date in chart ticks (ADM-20.7). */
export function shortDate(date: string): string {
  const [, month, day] = date.split("-");
  return `${Number(day)} ${MONTHS[Number(month) - 1] ?? ""}`;
}

/** Multipliers whose half is also round, so the middle tick reads well. */
const NICE = [1, 2, 4, 6, 8, 10];

/** A round top for the axis and the ticks 0, half and top (ADM-10a: 0 and two round ticks). */
export function axisTicks(max: number): { top: number; ticks: [number, number, number] } {
  // All-zero or tiny data: whole-number ticks 0, 1, 2 (never 0.5 tokens).
  if (max <= 1) return { top: 2, ticks: [0, 1, 2] };
  const base = 10 ** Math.floor(Math.log10(max));
  const top = (NICE.find((n) => n * base >= max) ?? 10) * base;
  return { top, ticks: [0, top / 2, top] };
}

export interface DayColumn {
  date: string;
  label: string;
  byModel: Record<LedgerModel, number>;
  total: number;
}

export interface DailyCostView {
  /** Oldest first, today last: always `CHART_DAYS` columns. */
  days: DayColumn[];
  top: number;
  ticks: [number, number, number];
  totalTokens: number;
  /** The model with the most tokens; on a tie the larger of opus, sonnet, haiku. */
  topModel: LedgerModel | null;
  /** Agent records in the window: zero means the empty state. */
  records: number;
  headline: string;
}

export function buildDailyCost(sessions: readonly LedgerSession[], now: Date): DailyCostView {
  const today = adminToday(now);
  const days: DayColumn[] = Array.from({ length: CHART_DAYS }, (_, i) => {
    const date = addDays(today, i - (CHART_DAYS - 1));
    return {
      date,
      label: shortDate(date),
      byModel: { haiku: 0, sonnet: 0, opus: 0 },
      total: 0,
    };
  });
  const byDate = new Map(days.map((d) => [d.date, d]));
  let records = 0;
  for (const s of effectiveSessions(sessions)) {
    const day = byDate.get(s.date);
    if (!day) continue;
    for (const a of s.agents) {
      records += 1;
      day.byModel[a.model] += a.tokens;
      day.total += a.tokens;
    }
  }
  const totalTokens = days.reduce((n, d) => n + d.total, 0);
  const sums = LEDGER_MODELS.map((m) => ({ m, n: days.reduce((n, d) => n + d.byModel[m], 0) }));
  // Later models win a tie: LEDGER_MODELS runs haiku, sonnet, opus.
  const best = sums.reduce((a, b) => (b.n >= a.n ? b : a));
  const topModel = totalTokens > 0 ? best.m : null;
  const { top, ticks } = axisTicks(Math.max(...days.map((d) => d.total)));
  const headline =
    `${formatTokens(totalTokens, true)} tokens in ${CHART_DAYS} days` +
    (topModel === null ? "" : `, mostly ${topModel}`);
  return { days, top, ticks, totalTokens, topModel, records, headline };
}
