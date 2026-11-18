/**
 * ADR-0011 compatibility plan item 4: the response handling of the RELEASED extension 0.2.3,
 * frozen as a fixture. Do not "fix" or update this file: it stands for the installs that have not
 * updated yet. It is copied from `main` before #179 (apps/extension/package.json 0.2.3; there is
 * no git tag), from:
 *   - apps/extension/src/background/sync/supabase-ingest.ts (whole file; the type import from
 *     ./sync-service is inlined below);
 *   - apps/extension/src/background/sync/sync-service.ts, cycle(): the SYNC-05b check;
 *   - apps/extension/src/background/tracking/outbox.ts: endedInServerFuture() and the
 *     defer / quarantine rule of settle().
 * Constants are inlined with their 0.2.3 values (SYNC.CLOCK_SLACK_S 5, DATA.FUTURE_TOLERANCE_S
 * 300, SYNC.CLOCK_RETRY_MAX 3), so a later change in packages/shared cannot change the fixture.
 */
import { createClient } from "@supabase/supabase-js";

// --- from sync-service.ts (types) -----------------------------------------------------------
export interface Interval {
  id: string;
  device_id: string;
  domain: string;
  started_at: string;
  ended_at: string;
}

export type IngestResult =
  | { ok: true; confirmedIds: string[]; serverNow?: number | null }
  | { ok: false; kind: "unavailable" | "abuse" | "auth" | "client" | "expired" };

export type Ingest = (
  batch: Interval[],
  accessToken: string,
  signal?: AbortSignal,
) => Promise<IngestResult>;

// --- supabase-ingest.ts (0.2.3, verbatim below this line) -----------------------------------
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
// --- end of supabase-ingest.ts --------------------------------------------------------------

// --- outbox.ts: endedInServerFuture (constants inlined) ------------------------------------
const CLOCK_SLACK_MS = 5 * 1000;
const FUTURE_TOLERANCE_MS = 300 * 1000;
const CLOCK_RETRY_MAX = 3;

export function endedInServerFuture(i: Interval, serverNow: number | null): boolean {
  return (
    serverNow !== null && Date.parse(i.ended_at) > serverNow - CLOCK_SLACK_MS + FUTURE_TOLERANCE_MS
  );
}

/**
 * What 0.2.3 does with one successful reply, for a first attempt of every interval:
 * sync-service.ts cycle() (SYNC-05b: "nothing confirmed" for several intervals not explained by
 * the clock is a sync error with a 1 h backoff) and outbox.ts settle() (confirmed ids leave the
 * outbox; an unconfirmed one is deferred when it ended in the server's future, else quarantined).
 */
export type Outcome =
  | { kind: "sync-error" }
  | { kind: "settled"; confirmed: string[]; deferred: string[]; quarantined: string[] };

export function outcomeOf(batch: Interval[], result: Extract<IngestResult, { ok: true }>): Outcome {
  const serverNow = result.serverNow ?? null;
  const confirmed = new Set(result.confirmedIds);
  const rejected = batch.filter((i) => !confirmed.has(i.id));
  const future = rejected.filter((i) => endedInServerFuture(i, serverNow));
  if (confirmed.size === 0 && rejected.length - future.length > 1) return { kind: "sync-error" };
  const tries = 1;
  const deferred: string[] = [];
  const quarantined: string[] = [];
  for (const i of rejected) {
    if (serverNow !== null && endedInServerFuture(i, serverNow) && tries <= CLOCK_RETRY_MAX) {
      deferred.push(i.id);
    } else {
      quarantined.push(i.id);
    }
  }
  return {
    kind: "settled",
    confirmed: batch.filter((i) => confirmed.has(i.id)).map((i) => i.id),
    deferred,
    quarantined,
  };
}
