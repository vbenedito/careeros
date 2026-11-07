/**
 * Dashboard data (DASH-06..09, DASH-15): two RPCs per page load with the user's session (RLS).
 * Server-only; no client cache.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Period } from "./period";

export interface DayTotal {
  day: string;
  seconds: number;
}
export interface DomainTotal {
  domain: string;
  seconds: number;
}

export interface DashboardData {
  /** Today's total, independent of the selected period (DASH-06 card 1). */
  todaySeconds: number;
  /** One row per day of the period, zero-filled (DATA-10). */
  daily: DayTotal[];
  /** Largest first (DATA-11). */
  domains: DomainTotal[];
  periodSeconds: number;
}

export type DashboardResult =
  | { ok: true; data: DashboardData }
  /** `invalid-time-zone`: the database does not know the zone (its list can differ from Node's). */
  | { ok: false; reason: "invalid-time-zone" | "failed" };

export async function loadDashboard(
  supabase: SupabaseClient,
  period: Period,
  today: string,
  timeZone: string,
): Promise<DashboardResult> {
  const range = { p_from: period.from, p_to: period.to, p_tz: timeZone };
  const [daily, domains, todayRow] = await Promise.all([
    supabase.rpc("get_daily_totals", range),
    supabase.rpc("get_domain_totals", range),
    // Today may be outside the selected period; ask for it separately (one tiny row).
    supabase.rpc("get_daily_totals", { p_from: today, p_to: today, p_tz: timeZone }),
  ]);
  const error = daily.error ?? domains.error ?? todayRow.error;
  if (error) {
    return {
      ok: false,
      reason: error.message === "INVALID_TIME_ZONE" ? "invalid-time-zone" : "failed",
    };
  }

  const days = ((daily.data ?? []) as { day: string; seconds: number | string }[]).map((r) => ({
    day: r.day,
    seconds: Number(r.seconds),
  }));
  const byDomain = ((domains.data ?? []) as { domain: string; seconds: number | string }[]).map(
    (r) => ({ domain: r.domain, seconds: Number(r.seconds) }),
  );
  const todaySeconds = Number(
    ((todayRow.data ?? []) as { seconds: number | string }[])[0]?.seconds ?? 0,
  );
  return {
    ok: true,
    data: {
      todaySeconds,
      daily: days,
      domains: byDomain,
      periodSeconds: days.reduce((sum, d) => sum + d.seconds, 0),
    },
  };
}
