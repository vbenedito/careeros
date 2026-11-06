/**
 * Upload of closed intervals (SYNC-02..06, AUTH-11). One cycle at a time; batches of the
 * oldest ≤ 200 intervals go to `ingest_study_sessions`; confirmed ids leave the outbox, the
 * rest of the batch goes to quarantine. Failures back off and never discard data.
 */
import { type Interval, SYNC } from "@careeros/shared";
import { parseSyncState, SYNC_STATE_KEY, type SyncState } from "../../lib/sync-state";
import type { TokenProvider } from "../auth/auth-service";
import type { KeyValueArea } from "../auth/storage";
import type { Outbox } from "../tracking/outbox";

export type IngestResult =
  | { ok: true; confirmedIds: string[] }
  /** `expired`: the server says the access token expired (device clock behind): refresh, retry. */
  | { ok: false; kind: "unavailable" | "abuse" | "auth" | "client" | "expired" };

/** The RPC call (implemented with supabase-js in supabase-ingest.ts). */
export type Ingest = (batch: Interval[], accessToken: string) => Promise<IngestResult>;

const LONG_BACKOFF_MS = 60 * 60_000;

export type CycleOutcome =
  | "done" // nothing left to upload
  | "skipped" // backing off, or another cycle is running
  | "not-connected"
  | "failed";

export function createSyncService(deps: {
  outbox: Outbox;
  ingest: Ingest;
  storage: KeyValueArea;
  now: () => number;
  /** AUTH-11: the server rejected the session or the user is gone. */
  sessionRejected: () => Promise<void>;
}) {
  const { outbox, storage, now } = deps;
  let running: Promise<CycleOutcome> | null = null;

  const readState = async () => parseSyncState((await storage.get(SYNC_STATE_KEY))[SYNC_STATE_KEY]);
  const writeState = (state: SyncState) => storage.set({ [SYNC_STATE_KEY]: state });

  async function cycle(accessToken: TokenProvider, force: boolean): Promise<CycleOutcome> {
    const state = await readState();
    if (!force && now() < state.notBefore) return "skipped";
    await outbox.prune(); // SYNC-07/08

    for (;;) {
      const batch = await outbox.batch(SYNC.SYNC_BATCH_MAX);
      if (batch.length === 0) {
        await writeState({ failures: 0, notBefore: 0, lastOutcome: "ok", lastSyncedAt: now() });
        return "done";
      }
      let token = await accessToken();
      if (!token) {
        await writeState({ ...state, lastOutcome: "not-connected" });
        return "not-connected";
      }

      let result = await deps.ingest(batch, token);
      if (!result.ok && result.kind === "expired") {
        // Not a revoked session (AUTH-11): refresh once and retry.
        token = await accessToken({ forceRefresh: true });
        result = token ? await deps.ingest(batch, token) : { ok: false, kind: "unavailable" };
      }
      if (result.ok) {
        await outbox.settle(batch, result.confirmedIds); // SYNC-04/05
        state.failures = 0;
        continue; // SYNC-03: repeat while the outbox is not empty
      }

      // SYNC-06
      if (result.kind === "auth") {
        await deps.sessionRejected();
        await writeState({ ...state, lastOutcome: "not-connected" });
        return "not-connected";
      }
      if (result.kind === "unavailable" || result.kind === "expired") {
        const failures = state.failures + 1;
        const minutes = SYNC.BACKOFF_MIN[Math.min(failures, SYNC.BACKOFF_MIN.length) - 1] ?? 30;
        await writeState({
          ...state,
          failures,
          notBefore: now() + minutes * 60_000,
          lastOutcome: "offline",
        });
      } else {
        // Abuse limit or a malformed call (bug): wait an hour. Data is never dropped.
        await writeState({
          ...state,
          notBefore: now() + LONG_BACKOFF_MS,
          lastOutcome: result.kind === "abuse" ? "abuse" : "error",
        });
      }
      return "failed";
    }
  }

  return {
    /**
     * Runs one cycle unless one is already running (SYNC-02; Chrome runs a single worker, so
     * an in-memory guard is enough). `force` ignores the backoff (the final sync).
     */
    run(
      accessToken: TokenProvider,
      options: { force?: boolean; ifIdle?: boolean } = {},
    ): Promise<CycleOutcome> {
      // `ifIdle`: never wait for a running cycle — it may be waiting for the AuthService lock
      // the caller holds (disconnect's final sync).
      if (running)
        return options.ifIdle ? Promise.resolve("skipped") : running.then(() => "skipped");
      running = cycle(accessToken, options.force === true).finally(() => {
        running = null;
      });
      return running;
    },
    status: readState,
  };
}

export type SyncService = ReturnType<typeof createSyncService>;
