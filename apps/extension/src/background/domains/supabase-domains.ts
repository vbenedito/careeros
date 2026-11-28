/** DomainsApi over PostgREST; RLS limits every call to the signed-in user (SEC-07). */

import { ENTITLEMENTS, parseLimitErrorDetails } from "@careeros/shared";
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { type DomainsApi, DomainsApiError } from "./domain-service";

export function toError(error: PostgrestError | null, status: number): DomainsApiError | null {
  if (!error) return null;
  // An expired JWT (PGRST301/303, e.g. device clock behind) is temporary, not a revoked session.
  if (error.code === "PGRST301" || error.code === "PGRST303")
    return new DomainsApiError("UNAVAILABLE");
  // AUTH-11: no user in the token (401/PT401) or the user no longer exists (FK violation on
  // insert) — the session is gone: the extension shows "Not connected".
  if (status === 401 || error.code === "PT401" || error.code === "23503") {
    return new DomainsApiError("UNAUTHORIZED");
  }
  // ENT-07: new databases send `details` with the limit and the plan; an older one (or a proxy
  // that drops it) still sends the hint (ENT-06), which gives the error without a number.
  const details = parseLimitErrorDetails(error.details);
  if (details) return new DomainsApiError("LIMIT_REACHED", details.limit);
  if (error.hint === ENTITLEMENTS.LIMIT_ERROR_HINT) return new DomainsApiError("LIMIT_REACHED");
  return new DomainsApiError("UNAVAILABLE");
}

export function createSupabaseDomainsApi(client: SupabaseClient): DomainsApi {
  return {
    async list() {
      const { data, error, status } = await client.from("tracked_domains").select("domain");
      const failure = toError(error, status);
      if (failure) throw failure;
      return (data ?? []).map((row: { domain: string }) => row.domain);
    },
    async insert(domain) {
      const { error, status } = await client.from("tracked_domains").insert({ domain });
      if (error?.code === "23505") return; // already tracked: same outcome
      const failure = toError(error, status);
      if (failure) throw failure;
    },
    async trackProblems() {
      // DATA-13: RLS returns only the caller's row; no row = off (PRB-01).
      const { data, error, status } = await client
        .from("account_settings")
        .select("track_problems")
        .maybeSingle();
      const failure = toError(error, status);
      if (failure) throw failure;
      return (data as { track_problems?: unknown } | null)?.track_problems === true;
    },
    async problemRules() {
      // PSR-19: RLS returns only the caller's rows; only active rules (no tombstone) are wanted.
      const { data, error, status } = await client
        .from("problem_rules")
        .select("domain,prefix,kind,label")
        .is("removed_at", null);
      const failure = toError(error, status);
      if (failure) throw failure;
      return (data ?? []) as unknown[];
    },
    async delete(domain) {
      const { error, status } = await client.from("tracked_domains").delete().eq("domain", domain);
      const failure = toError(error, status);
      if (failure) throw failure;
    },
  };
}
