/**
 * GET /auth/callback?code=...&next=/path
 * OAuth return URL: exchanges the one-time code for a cookie session (AUTH-01, AUTH-02).
 */
import { NextResponse } from "next/server";
import { safeNextPath } from "@/lib/auth/routes";
import { siteUrl } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  if (!code) {
    // The provider or Supabase reported an error (e.g. consent denied, unverified email).
    return NextResponse.redirect(new URL("/sign-in?error=oauth", siteUrl()));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL("/sign-in?error=callback", siteUrl()));
  }
  return NextResponse.redirect(new URL(next, siteUrl()));
}
