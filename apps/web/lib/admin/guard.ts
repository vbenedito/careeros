/**
 * ADM-02: the admin check, on the server, before any admin data is read. Signed in (verified
 * claims, AUTH-02) and a row in `public.admins`, selected with the user's own session: RLS lets
 * a user read only their own row, and no secret key is involved. Anything else is the normal 404
 * page (the same as an unknown path), never a redirect or a "forbidden".
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { notFound } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/** True only for a signed-in user whose own row exists in `admins`. Any error means no. */
export async function isAdmin(supabase: SupabaseClient): Promise<boolean> {
  const { data, error } = await supabase.auth.getClaims();
  const sub = error ? null : data?.claims?.sub;
  if (typeof sub !== "string" || sub === "") return false;
  const { data: row, error: rowError } = await supabase
    .from("admins")
    .select("user_id")
    .eq("user_id", sub)
    .maybeSingle();
  return !rowError && row?.user_id === sub;
}

/**
 * Calls `notFound()` unless the visitor is an admin. Memoized per request, so the layout and the
 * page can both call it: a layout does not hold back the page's own data loading, so the page
 * awaits this before it reads anything (ADM-02).
 */
export const requireAdmin = cache(async (): Promise<void> => {
  let allowed = false;
  try {
    allowed = await isAdmin(await createClient());
  } catch {
    allowed = false;
  }
  if (!allowed) notFound();
});
