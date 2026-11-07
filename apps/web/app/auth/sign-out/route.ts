/**
 * POST /auth/sign-out
 * Ends the dashboard session only (AUTH-04: scope "local"); a connected extension keeps its own.
 * With the form field `scope=global` it signs out of all devices (AUTH-12a): every session of
 * the user is revoked, including extensions in other browsers.
 */
import { NextResponse } from "next/server";
import { siteUrl } from "@/lib/env";
import { isSameOrigin } from "@/lib/security/origin";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const form = await request.formData().catch(() => null);
  const scope = form?.get("scope") === "global" ? "global" : "local";
  const supabase = await createClient();
  await supabase.auth.signOut({ scope });
  return NextResponse.redirect(new URL("/sign-in", siteUrl()), 303);
}
