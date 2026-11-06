/** DomainsApi over PostgREST; RLS limits every call to the signed-in user (SEC-07). */
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { type DomainsApi, DomainsApiError } from "./domain-service";

function toError(error: PostgrestError | null, status: number): DomainsApiError | null {
  if (!error) return null;
  if (status === 401 || error.code === "PGRST301" || error.code === "PGRST303") {
    return new DomainsApiError("UNAUTHORIZED");
  }
  if (error.hint === "DATA-01") return new DomainsApiError("LIMIT_REACHED");
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
    async delete(domain) {
      const { error, status } = await client.from("tracked_domains").delete().eq("domain", domain);
      const failure = toError(error, status);
      if (failure) throw failure;
    },
  };
}
