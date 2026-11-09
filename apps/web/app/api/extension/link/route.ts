/**
 * POST /api/extension/link → { tokenHash }
 * Mints a single-use token so the extension can create its own session (AUTH-08/09, ADR-0003).
 * Requires the dashboard session and the dashboard Origin; 5 per minute per user.
 * The token is never logged or stored and expires after 300 s (otp_expiry).
 */
import { NextResponse } from "next/server";
import { errorFields, logServerError } from "@/lib/log";
import { isSameOrigin } from "@/lib/security/origin";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const noStore = { "Cache-Control": "no-store" };
const fail = (status: number, error: string) =>
  NextResponse.json({ error }, { status, headers: noStore });

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return fail(403, "FORBIDDEN");

  // getUser(), not getClaims(): Supabase Auth confirms the session still exists, so an access
  // token whose session was revoked ("Sign out of all devices", AUTH-12a) cannot mint a new,
  // independent extension session. The email also comes from the database, not a stale claim.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail(401, "NOT_AUTHENTICATED");
  if (!user.email) return fail(400, "NO_EMAIL");

  // Rate limit in Postgres, counted for the signed-in user (runs with the user's session).
  const { data: allowed, error: quotaError } = await supabase.rpc("consume_extension_link_quota");
  if (quotaError) {
    logServerError("extension_link.quota_failed", errorFields(quotaError));
    return fail(500, "INTERNAL");
  }
  if (!allowed) return fail(429, "RATE_LIMITED");

  const { data, error } = await createAdminClient().auth.admin.generateLink({
    type: "magiclink",
    email: user.email,
  });
  // The token must sign in as the caller and nobody else (never a different or new account).
  if (error || !data.properties?.hashed_token || data.user?.id !== user.id) {
    // A 401 here means SUPABASE_SECRET_KEY is wrong for this project (ENV-11, no personal data).
    logServerError(
      "extension_link.generate_failed",
      error ? errorFields(error) : { code: "unexpected_result", status: null, message: null },
    );
    return fail(500, "INTERNAL");
  }

  return NextResponse.json({ tokenHash: data.properties.hashed_token }, { headers: noStore });
}
