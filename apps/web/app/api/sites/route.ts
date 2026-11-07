/**
 * POST /api/sites { domain } → { id, domain }
 * Adds a tracked site for the signed-in user (DASH-12). Accepts what the user typed (a host or
 * a URL) and stores the normalized domain; adding a site that is already tracked succeeds.
 * Runs with the user's session, so RLS and the 50-site limit (DATA-01) apply.
 */
import { parseDomainInput } from "@careeros/shared";
import { fail, json } from "@/lib/http/json";
import { isSameOrigin } from "@/lib/security/origin";
import { AddSiteRequestSchema } from "@/lib/settings/sites";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return fail(403, "FORBIDDEN");
  if (!(await getCurrentUser())) return fail(401, "NOT_AUTHENTICATED");

  const body = AddSiteRequestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return fail(400, "INVALID_DOMAIN");
  const parsed = parseDomainInput(body.data.domain);
  if (!parsed.ok) return fail(400, "INVALID_DOMAIN");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tracked_domains")
    .insert({ domain: parsed.domain })
    .select("id, domain")
    .single();
  if (!error) return json(data, 201);
  if (error.code === "23505") {
    const existing = await supabase
      .from("tracked_domains")
      .select("id, domain")
      .eq("domain", parsed.domain)
      .single();
    if (existing.data) return json(existing.data);
  }
  if (error.hint === "DATA-01") return fail(422, "LIMIT_REACHED");
  // The account was deleted while this session's access token was still valid (AUTH-13).
  if (error.code === "23503") return fail(401, "NOT_AUTHENTICATED");
  return fail(500, "INTERNAL");
}
