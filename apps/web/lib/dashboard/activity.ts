/**
 * Study activity bar chart data (DASH-08): one bar per day of the period, labelled by weekday
 * (week) or day number (month), today highlighted only when it is inside the period. Pure.
 */
import { formatDuration } from "@careeros/shared";
import type { DayTotal } from "./data";
import type { Period } from "./period";

export interface ActivityBar {
  day: string;
  /** Axis label: "Mon" … "Sun" (week) or "1" … "31" (month). */
  label: string;
  /** Minutes (the chart's y unit). */
  minutes: number;
  isToday: boolean;
  /** Tooltip: "Tue, Nov 3 · 1h 05m". */
  tooltip: string;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parts(day: string) {
  const date = new Date(`${day}T00:00:00Z`);
  return {
    weekday: WEEKDAYS[date.getUTCDay()] ?? "",
    month: MONTHS[date.getUTCMonth()] ?? "",
    dayOfMonth: date.getUTCDate(),
  };
}

export function activityBars(daily: DayTotal[], period: Period, today: string): ActivityBar[] {
  const byDay = new Map(daily.map((d) => [d.day, d.seconds]));
  return period.days.map((day) => {
    const seconds = byDay.get(day) ?? 0;
    const { weekday, month, dayOfMonth } = parts(day);
    return {
      day,
      label: period.view === "week" ? weekday : String(dayOfMonth),
      // Exact value: the bar must agree with the cards and the tooltip (which round down). A day
      // with very little study still gets a visible bar from the chart's minimum bar height.
      minutes: seconds / 60,
      isToday: day === today,
      tooltip: `${weekday}, ${month} ${dayOfMonth} · ${formatDuration(seconds)}`,
    };
  });
}

/** Minimum bar height in pixels (Recharts `minPointSize`): visible for any study, none for zero. */
export function minBarSize(minutes: number | null | undefined): number {
  return minutes && minutes > 0 ? 3 : 0;
}

/** Y-axis ticks in minutes, shown as durations ("30m", "1h 00m"). */
export function formatMinutesTick(minutes: number): string {
  return formatDuration(minutes * 60);
}
