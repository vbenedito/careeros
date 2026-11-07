/**
 * Summary cards (DASH-06) as a pure function of the loaded data: today, the selected period and
 * the top platform. Components only render the result.
 */
import type { DashboardData } from "./data";
import type { Period } from "./period";

export interface SummaryCard {
  id: "today" | "period" | "top";
  title: string;
  /** Seconds, or null for "—" (no data). */
  seconds: number | null;
  /** Secondary line: the top domain and its share, or a short caption. */
  detail: string | null;
  /** Top platform only: kept apart so a long domain is truncated, never the share. */
  domain?: string;
  share?: number;
}

export function summarize(data: DashboardData, period: Period): SummaryCard[] {
  const top = data.domains.find((d) => d.seconds > 0) ?? null;
  const share =
    top && data.periodSeconds > 0 ? Math.round((top.seconds / data.periodSeconds) * 100) : null;
  return [
    { id: "today", title: "Today", seconds: data.todaySeconds, detail: null },
    {
      id: "period",
      // "This week" / "This month" for the current period, otherwise its label (e.g. "Oct 2026").
      title: period.label,
      seconds: data.periodSeconds,
      detail: null,
    },
    {
      id: "top",
      title: "Top platform",
      seconds: top ? top.seconds : null,
      detail: top ? `${top.domain} · ${share}%` : null,
      ...(top && share !== null ? { domain: top.domain, share } : {}),
    },
  ];
}
