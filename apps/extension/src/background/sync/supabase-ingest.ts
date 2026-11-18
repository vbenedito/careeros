/**
 * `ingest_study_sessions_v2` over PostgREST (DATA-06b, SYNC-03a, ADR-0011), mapped to SYNC-06
 * classes. From 0.3.0 the extension calls only v2: no fallback to `ingest_study_sessions`.
 */
import { parseIngestV2Reply } from "@careeros/shared";
import { createClient } from "@supabase/supabase-js";
import type { Ingest, IngestResult } from "./sync-service";

/** SYNC-03a: the only ingest RPC this extension calls. */
export const INGEST_RPC = "ingest_study_sessions_v2";

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
    // PRB-10: the slug (if any) travels in the interval; only v2 ever receives it.
    const call = client.rpc(INGEST_RPC, { sessions: batch });
    // SYNC-06a: a stalled connection is aborted by the caller's timeout.
    const { data, error, status } = await (signal ? call.abortSignal(signal) : call);
    const reply = error ? null : parseIngestV2Reply(data);
    if (reply)
      return { ok: true, confirmedIds: reply.confirmed, rejected: reply.rejected, serverNow };
    // A success whose body is not the v2 shape is a malformed call ("client": Sync error).
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
