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
import {
  type ProblemRuleRow,
  ProblemRuleRowSchema,
  type ProblemSiteRule,
  problemSiteRules,
  ruleLabels,
} from "./sites";

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
  /** PSR-14: domain → label of the user's rules; empty while problem rules are not live. */
  labels: ReadonlyMap<string, string> = new Map(),
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
  return { ok: true, rows: problemRows((data ?? []) as ProblemTotalRow[], showSite, labels) };
}

/** The account's active problem rules under RLS (a removed rule is not readable, PSR-22). `null` when the read fails. */
async function loadRuleRows(supabase: SupabaseClient): Promise<ProblemRuleRow[] | null> {
  const { data, error } = await supabase
    .from("problem_rules")
    .select("id, domain, prefix, label")
    .is("removed_at", null);
  if (error) {
    logServerError("problems.rules_failed", errorFields(error));
    return null;
  }
  const rows: ProblemRuleRow[] = [];
  for (const item of data ?? []) {
    const parsed = ProblemRuleRowSchema.safeParse(item);
    if (parsed.success) rows.push(parsed.data);
  }
  return rows;
}

/** PSR-14: domain → label for the dashboard rows; no history check (empty map when the read fails). */
export async function loadProblemRuleLabels(
  supabase: SupabaseClient,
): Promise<ReadonlyMap<string, string>> {
  const rows = await loadRuleRows(supabase);
  return ruleLabels(problemSiteRules(rows ?? [], new Set()));
}

/**
 * PSR-13: the rules for Settings and, per rule, whether its domain has stored ids (an `exists`
 * query; only booleans reach the browser). `null` when a read fails. A failed history check counts
 * as "has history", so Remove asks first (the safe side, like PRB-16).
 */
export async function loadProblemSiteRules(
  supabase: SupabaseClient,
): Promise<ProblemSiteRule[] | null> {
  const rows = await loadRuleRows(supabase);
  if (rows === null) return null;
  const withHistory = new Set<string>();
  await Promise.all(
    [...new Set(rows.map((r) => r.domain))].map(async (domain) => {
      const found = await supabase
        .from("study_session_problems")
        .select("session_id")
        .eq("domain", domain)
        .limit(1);
      if (found.error) {
        logServerError("problems.exists_failed", errorFields(found.error));
        withHistory.add(domain);
      } else if ((found.data?.length ?? 0) > 0) withHistory.add(domain);
    }),
  );
  return problemSiteRules(rows, withHistory);
}
