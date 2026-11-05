/**
 * POST /auth/sign-out
 * Ends the dashboard session only (AUTH-04: scope "local"); a connected extension keeps its own.
 */
import { NextResponse } from "next/server";
import { siteUrl } from "@/lib/env";
import { isSameOrigin } from "@/lib/security/origin";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  return NextResponse.redirect(new URL("/sign-in", siteUrl()), 303);
}
