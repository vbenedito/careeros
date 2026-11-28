/**
 * POST /api/settings/problem-rules { domain, prefix, kind, label, confirmedProblemId } → { id }
 * Adds one problem rule for the signed-in account (DASH-16, PSR-12, PSR-16, PSR-25). Only the
 * rule arrives here: the example URL is parsed in the page and never sent (PSR-11). Calls
 * `add_problem_rule` under the user's session; the database re-checks everything. Nothing from
 * the body is ever logged (PSR-11). Answers 404 until the store has extension 0.4.0 (ENV-05c).
 */
import { ENTITLEMENTS, parseLimitErrorDetails } from "@careeros/shared";
import { extensionFeatureLive } from "@/lib/env";
import { fail, json } from "@/lib/http/json";
import { errorFields, logServerError } from "@/lib/log";
import { AddProblemRuleRequestSchema } from "@/lib/problems/sites";
import { isSameOrigin } from "@/lib/security/origin";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

/** Refusals of the RPC (22023 with the code as message) the browser can show a message for. */
const REFUSALS = new Set([
  "CONFIRMATION_REQUIRED",
  "DOMAIN_NOT_TRACKED",
  "BUILT_IN_DOMAIN",
  "INVALID_DOMAIN",
  "INVALID_PREFIX",
  "INVALID_KIND",
  "INVALID_LABEL",
]);

export async function POST(request: Request) {
  // PSR-21, ENV-05c: until the store has 0.4.0 the feature does not exist for the dashboard.
  if (!extensionFeatureLive("problemRules")) return fail(404, "NOT_FOUND");
  if (!isSameOrigin(request)) return fail(403, "FORBIDDEN");
  if (!(await getCurrentUser())) return fail(401, "NOT_AUTHENTICATED");

  const body = AddProblemRuleRequestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return fail(400, "INVALID_REQUEST");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("add_problem_rule", {
    p_domain: body.data.domain,
    p_prefix: body.data.prefix,
    p_kind: body.data.kind,
    p_label: body.data.label,
    p_confirmed: body.data.confirmedProblemId,
  });
  if (!error && typeof data === "string") return json({ id: data }, 201);

  if (error) {
    if (error.code === "PT401" || error.code === "23503") return fail(401, "NOT_AUTHENTICATED");
    if (error.code === "23505") return fail(409, "DUPLICATE_RULE");
    // PSR-15, ENT-07: the number comes from the error's details; without it the code alone.
    if (error.hint === ENTITLEMENTS.PROBLEM_RULES_LIMIT_ERROR_HINT) {
      const limit = parseLimitErrorDetails(error.details);
      return json(
        { error: ENTITLEMENTS.LIMIT_ERROR_CODE, ...(limit ? { limit: limit.limit } : {}) },
        422,
      );
    }
    if (error.code === "22023" && REFUSALS.has(error.message)) return fail(400, error.message);
  }
  logServerError("problem_rules.add_failed", error ? errorFields(error) : {});
  return fail(500, "INTERNAL");
}
