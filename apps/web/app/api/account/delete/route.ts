/**
 * POST /api/account/delete (form: confirm=DELETE)
 * Deletes the signed-in user's account (DASH-14, DATA-12, AUTH-13): the auth user is removed
 * with the admin client, which revokes every refresh token and cascades to all application
 * rows. Then the dashboard cookies are cleared and the browser goes to /sign-in. A form post,
 * so failures go back to Settings with a message instead of a JSON page.
 * AUTH-14: only within 10 minutes of signing in; otherwise Settings asks to sign in again.
 */
import { NextResponse } from "next/server";
import { isRecentSignIn } from "@/lib/auth/recent-sign-in";
import { siteUrl } from "@/lib/env";
import { fail } from "@/lib/http/json";
import { errorFields, logServerError } from "@/lib/log";
import { isSameOrigin } from "@/lib/security/origin";
import { DELETE_CONFIRMATION, DELETE_SIGN_IN_PATH } from "@/lib/settings/account";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const back = (error: "delete" | "reauth" = "delete") =>
  NextResponse.redirect(new URL(`/settings?error=${error}#delete-account`, siteUrl()), 303);

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return fail(403, "FORBIDDEN");
  const form = await request.formData().catch(() => null);
  if (form?.get("confirm") !== DELETE_CONFIRMATION) return back();

  // getUser(): Supabase Auth confirms the session still exists before anything is deleted.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Session gone (#78): back to sign-in, then to this section, never a JSON page.
  if (!user) return NextResponse.redirect(new URL(DELETE_SIGN_IN_PATH, siteUrl()), 303);

  // AUTH-14: a stolen or long-lived session alone cannot delete the account. The claims come
  // from the same (just verified) session; `amr` keeps the time of the actual sign-in.
  const { data } = await supabase.auth.getClaims();
  if (data?.claims.sub !== user.id || !isRecentSignIn(data.claims, Date.now())) {
    return back("reauth");
  }

  const { error } = await createAdminClient().auth.admin.deleteUser(user.id);
  if (error) {
    logServerError("account_delete.failed", errorFields(error));
    return back();
  }

  // The session no longer exists on the server; this only clears the cookies.
  await supabase.auth.signOut({ scope: "local" });
  return NextResponse.redirect(new URL("/sign-in?deleted=1", siteUrl()), 303);
}
