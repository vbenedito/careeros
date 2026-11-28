/**
 * DELETE /api/settings/problem-rules/:id { deleteHistory } → { id }
 * Removes one problem rule of the signed-in account (DASH-16, PSR-13). `deleteHistory: true`
 * also deletes the stored ids of that domain (study time stays). Calls `remove_problem_rule`
 * under the user's session. Answers 404 until the store has extension 0.4.0 (ENV-05c).
 */
import { z } from "zod";
import { extensionFeatureLive } from "@/lib/env";
import { fail, json } from "@/lib/http/json";
import { errorFields, logServerError } from "@/lib/log";
import { RemoveProblemRuleRequestSchema } from "@/lib/problems/sites";
import { isSameOrigin } from "@/lib/security/origin";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!extensionFeatureLive("problemRules")) return fail(404, "NOT_FOUND");
  if (!isSameOrigin(request)) return fail(403, "FORBIDDEN");
  if (!(await getCurrentUser())) return fail(401, "NOT_AUTHENTICATED");
  const id = z
    .string()
    .uuid()
    .safeParse((await ctx.params).id);
  if (!id.success) return fail(404, "NOT_FOUND");
  const body = RemoveProblemRuleRequestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return fail(400, "INVALID_REQUEST");

  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_problem_rule", {
    p_rule_id: id.data,
    p_delete_history: body.data.deleteHistory,
  });
  if (!error) return json({ id: id.data });
  if (error.code === "PT401" || error.code === "23503") return fail(401, "NOT_AUTHENTICATED");
  // Not the caller's, or already removed: a client cannot tell the two apart.
  if (error.code === "PT404") return fail(404, "NOT_FOUND");
  logServerError("problem_rules.remove_failed", errorFields(error));
  return fail(500, "INTERNAL");
}
