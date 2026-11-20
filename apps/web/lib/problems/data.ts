/**
 * Problem data for the dashboard and Settings (DASH-15): the account setting, whether slugs are
 * stored, and the list for the period. All with the user's session, so RLS applies. Server-only.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyLoadError, type LoadErrorKind } from "@/lib/dashboard/load-error";
import type { Period } from "@/lib/dashboard/period";
import { errorFields, logServerError } from "@/lib/log";
import { type ProblemRow, type ProblemTotalRow, problemRows } from "./list";

/**
 * PRB-01 / DATA-13: no row means off. A read that fails is `unknown`: the dashboard then shows
 * neither the problems card nor the announcement (it does not know which one is true).
 */
export async function loadProblemSetting(
  supabase: SupabaseClient,
): Promise<"on" | "off" | "unknown"> {
  const { data, error } = await supabase
    .from("account_settings")
    .select("track_problems")
    .maybeSingle();
  if (error) {
    logServerError("problems.setting_failed", errorFields(error));
    return "unknown";
  }
  return data?.track_problems === true ? "on" : "off";
}

/**
 * DASH-16: does the account have a stored slug? An `exists` query on the owner-only table; only
 * the boolean leaves the server. When the read fails, answer true, so the confirm dialog is shown
 * (asking is the safe side of PRB-16).
 */
export async function hasStoredProblems(supabase: SupabaseClient): Promise<boolean> {
  const { data, error } = await supabase
    .from("study_session_problems")
    .select("session_id")
    .limit(1);
  if (error) {
    logServerError("problems.exists_failed", errorFields(error));
    return true;
  }
  return (data?.length ?? 0) > 0;
}

export type ProblemsResult =
  | { ok: true; rows: ProblemRow[] }
  | { ok: false; reason: LoadErrorKind };

/**
 * DASH-17: `get_problem_totals_v2` (one row per site and slug, DATA-15a) for the selected period,
 * in the viewer's time zone (DASH-07). `showSite` follows the NeetCode copy gate (PRB-11).
 */
export async function loadProblems(
  supabase: SupabaseClient,
  period: Period,
  timeZone: string,
  showSite = false,
): Promise<ProblemsResult> {
  const { data, error, status } = await supabase.rpc("get_problem_totals_v2", {
    p_from: period.from,
    p_to: period.to,
    p_tz: timeZone,
  });
  if (error) {
    logServerError("problems.load_failed", { ...errorFields(error), status });
    return { ok: false, reason: classifyLoadError({ status, code: error.code }) };
  }
  return { ok: true, rows: problemRows((data ?? []) as ProblemTotalRow[], showSite) };
}
