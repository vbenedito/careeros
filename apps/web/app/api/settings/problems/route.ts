/**
 * PUT /api/settings/problems { enabled, deleteHistory? } → { enabled }
 * Turns "Track LeetCode problems" on or off for the signed-in account (DASH-16, PRB-01). Calls
 * `set_problem_tracking` (DATA-17) under the user's session: the database is the only writer of
 * the setting and the only deleter of slugs. `deleteHistory: true` needs `enabled: false`.
 * Answers 404 while the store extension is older than `EXTENSION_FEATURES.problemTracking` or
 * `EXTENSION_STORE_VERSION` is unset (PRB-23, ENV-05c).
 */
import { extensionFeatureLive } from "@/lib/env";
import { fail, json } from "@/lib/http/json";
import { errorFields, logServerError } from "@/lib/log";
import { ProblemSettingRequestSchema } from "@/lib/problems/settings";
import { isSameOrigin } from "@/lib/security/origin";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

export async function PUT(request: Request) {
  // PRB-23, ENV-05c: until the store has an extension that tracks problems the feature does not exist for the
  // dashboard, so the API agrees with the UI. Stored data is untouched; the extension only reads
  // the setting (DATA-13, `account_settings` under the user's session), never this route.
  if (!extensionFeatureLive("problemTracking")) return fail(404, "NOT_FOUND");
  if (!isSameOrigin(request)) return fail(403, "FORBIDDEN");
  if (!(await getCurrentUser())) return fail(401, "NOT_AUTHENTICATED");

  const body = ProblemSettingRequestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return fail(400, "INVALID_REQUEST");

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_problem_tracking", {
    p_enabled: body.data.enabled,
    p_delete_history: body.data.deleteHistory ?? false,
  });
  if (!error) return json({ enabled: body.data.enabled });

  // The session ended, or the account was deleted, while this request was in flight.
  if (error.code === "PT401" || error.code === "23503") return fail(401, "NOT_AUTHENTICATED");
  if (error.code === "22023") return fail(400, "INVALID_REQUEST");
  logServerError("problems.set_failed", errorFields(error));
  return fail(500, "INTERNAL");
}
