/**
 * "Time by platform" donut (DASH-09): top 5 domains + "Other", with durations and whole
 * percentages that sum to 100. Pure.
 */
import { formatDuration } from "@careeros/shared";
import type { DomainTotal } from "./data";
import { wholePercentages } from "./percent";

export interface PlatformSlice {
  name: string;
  seconds: number;
  duration: string;
  percent: number;
  /** CSS colour from the design tokens. */
  color: string;
}

export const TOP_PLATFORMS = 5;

/** Slices for the period; empty when there is no data. */
export function platformSlices(domains: readonly DomainTotal[]): PlatformSlice[] {
  const withTime = domains.filter((d) => d.seconds > 0);
  const top = withTime.slice(0, TOP_PLATFORMS);
  const otherSeconds = withTime.slice(TOP_PLATFORMS).reduce((sum, d) => sum + d.seconds, 0);
  const rows = [
    ...top.map((d) => ({ name: d.domain, seconds: d.seconds })),
    ...(otherSeconds > 0 ? [{ name: "Other", seconds: otherSeconds }] : []),
  ];
  const percents = wholePercentages(rows.map((r) => r.seconds));
  return rows.map((r, i) => ({
    ...r,
    duration: formatDuration(r.seconds),
    percent: percents[i] ?? 0,
    // "Other" only exists past the top 5, so it always lands on --chart-6 (the neutral one).
    color: `var(--chart-${i + 1})`,
  }));
}
