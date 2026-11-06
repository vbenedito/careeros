/** `ingest_study_sessions` over PostgREST (spec 04 DATA-06..09), mapped to SYNC-06 classes. */
import { createClient } from "@supabase/supabase-js";
import type { Ingest, IngestResult } from "./sync-service";

export function createSupabaseIngest(config: {
  supabaseUrl: string;
  publishableKey: string;
}): Ingest {
  return async (batch, accessToken) => {
    // A short-lived client per call: the token comes from AuthService (AUTH-10).
    const client = createClient(config.supabaseUrl, config.publishableKey, {
      accessToken: async () => accessToken,
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data, error, status } = await client.rpc("ingest_study_sessions", { sessions: batch });
    if (!error && Array.isArray(data)) return { ok: true, confirmedIds: data as string[] };
    return { ok: false, kind: classify(status, error?.code, error?.message) };
  };
}

export function classify(
  status: number,
  code: string | undefined,
  message: string | undefined,
): Extract<IngestResult, { ok: false }>["kind"] {
  if (status === 401 || status === 403 || code === "PT401" || code === "23503") return "auth";
  if (message === "ABUSE_LIMIT") return "abuse";
  if (status === 0 || status === 429 || status >= 500) return "unavailable";
  return "client";
}
