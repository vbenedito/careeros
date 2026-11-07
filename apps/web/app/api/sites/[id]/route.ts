/**
 * DELETE /api/sites/:id → { id }
 * Removes one of the signed-in user's tracked sites (DASH-12). RLS limits the delete to the
 * caller's own rows; removing a site that no longer exists succeeds (idempotent).
 */
import { z } from "zod";
import { fail, json } from "@/lib/http/json";
import { isSameOrigin } from "@/lib/security/origin";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(request)) return fail(403, "FORBIDDEN");
  if (!(await getCurrentUser())) return fail(401, "NOT_AUTHENTICATED");
  const id = z
    .string()
    .uuid()
    .safeParse((await ctx.params).id);
  if (!id.success) return fail(404, "NOT_FOUND");

  const supabase = await createClient();
  const { error } = await supabase.from("tracked_domains").delete().eq("id", id.data);
  return error ? fail(500, "INTERNAL") : json({ id: id.data });
}
