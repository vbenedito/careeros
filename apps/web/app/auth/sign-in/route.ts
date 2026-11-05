/**
 * POST /auth/sign-in  (form: provider=google|github, next=/path)
 * Starts the OAuth PKCE flow (AUTH-01) and redirects the browser to the provider.
 */
import { NextResponse } from "next/server";
import { isAuthProvider, safeNextPath } from "@/lib/auth/routes";
import { siteUrl } from "@/lib/env";
import { isSameOrigin } from "@/lib/security/origin";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const form = await request.formData();
  const provider = form.get("provider");
  if (!isAuthProvider(provider)) {
    return NextResponse.redirect(new URL("/sign-in?error=provider", siteUrl()), 303);
  }
  const next = safeNextPath(String(form.get("next") ?? "/"));
  const callback = new URL("/auth/callback", siteUrl());
  callback.searchParams.set("next", next);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: callback.toString(),
      skipBrowserRedirect: true,
      // AUTH-05: GitHub only shares a verified email with this scope.
      ...(provider === "github" ? { scopes: "user:email" } : {}),
    },
  });
  if (error || !data.url) {
    return NextResponse.redirect(new URL("/sign-in?error=provider", siteUrl()), 303);
  }
  return NextResponse.redirect(data.url, 303);
}
