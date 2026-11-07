/**
 * POST /api/account/delete (form: confirm=DELETE)
 * Deletes the signed-in user's account (DASH-14, DATA-12, AUTH-13): the auth user is removed
 * with the admin client, which revokes every refresh token and cascades to all application
 * rows. Then the dashboard cookies are cleared and the browser goes to /sign-in. A form post,
 * so failures go back to Settings with a message instead of a JSON page.
 */
import { NextResponse } from "next/server";
import { siteUrl } from "@/lib/env";
import { fail } from "@/lib/http/json";
import { isSameOrigin } from "@/lib/security/origin";
import { DELETE_CONFIRMATION } from "@/lib/settings/account";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const back = () => NextResponse.redirect(new URL("/settings?error=delete", siteUrl()), 303);

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return fail(403, "FORBIDDEN");
  const form = await request.formData().catch(() => null);
  if (form?.get("confirm") !== DELETE_CONFIRMATION) return back();

  // getUser(): Supabase Auth confirms the session still exists before anything is deleted.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/sign-in", siteUrl()), 303);

  const { error } = await createAdminClient().auth.admin.deleteUser(user.id);
  if (error) return back();

  // The session no longer exists on the server; this only clears the cookies.
  await supabase.auth.signOut({ scope: "local" });
  return NextResponse.redirect(new URL("/sign-in?deleted=1", siteUrl()), 303);
}
