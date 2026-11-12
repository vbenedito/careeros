/** `ingest_study_sessions` over PostgREST (spec 04 DATA-06..09), mapped to SYNC-06 classes. */
import { createClient } from "@supabase/supabase-js";
import type { Ingest, IngestResult } from "./sync-service";

export function createSupabaseIngest(config: {
  supabaseUrl: string;
  publishableKey: string;
}): Ingest {
  return async (batch, accessToken, signal) => {
    // SYNC-05a: the server's clock, from the response's `Date` header (exposed to CORS
    // callers by PostgREST), tells a "future" rejection (device clock ahead) from others.
    let serverNow: number | null = null;
    const fetchWithDate: typeof fetch = async (input, init) => {
      const response = await fetch(input, init);
      serverNow = parseDateHeader(response.headers.get("date"));
      return response;
    };
    // A short-lived client per call: the token comes from AuthService (AUTH-10).
    const client = createClient(config.supabaseUrl, config.publishableKey, {
      accessToken: async () => accessToken,
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: fetchWithDate },
    });
    const call = client.rpc("ingest_study_sessions", { sessions: batch });
    // SYNC-06a: a stalled connection is aborted by the caller's timeout.
    const { data, error, status } = await (signal ? call.abortSignal(signal) : call);
    if (!error && Array.isArray(data))
      return { ok: true, confirmedIds: data as string[], serverNow };
    return { ok: false, kind: classify(status, error?.code, error?.message) };
  };
}

/** Epoch ms of an HTTP `Date` header, or null. */
export function parseDateHeader(value: string | null): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

export function classify(
  status: number,
  code: string | undefined,
  message: string | undefined,
): Extract<IngestResult, { ok: false }>["kind"] {
  // PostgREST: PGRST301/303 = JWT expired or invalid — refresh and retry, not a revoked
  // session. PT401 = no user; 23503 = the user no longer exists (AUTH-11). 403 = missing grant:
  // a deployment bug, shown as "Sync error", never a sign-out.
  if (code === "PGRST301" || code === "PGRST303") return "expired";
  if (code === "PT401" || code === "23503" || status === 401) return "auth";
  if (message === "ABUSE_LIMIT") return "abuse";
  if (status === 0 || status === 429 || status >= 500) return "unavailable";
  return "client";
}
