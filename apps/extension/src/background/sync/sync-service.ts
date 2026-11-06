/**
 * Upload of closed intervals (SYNC-02..06, AUTH-11). One cycle at a time; batches of the
 * oldest ≤ 200 intervals go to `ingest_study_sessions`; confirmed ids leave the outbox, the
 * rest of the batch goes to quarantine. Failures back off and never discard data.
 */
import { type Interval, SYNC } from "@careeros/shared";
import type { KeyValueArea } from "../auth/storage";
import type { Outbox } from "../tracking/outbox";

/** Persisted sync status (backoff and the last error shown in the popup, ENV-10). */
export const SYNC_STATE_KEY = "careeros.sync.state";

export type IngestResult =
  | { ok: true; confirmedIds: string[] }
  | { ok: false; kind: "unavailable" | "abuse" | "auth" | "client" };

/** The RPC call (implemented with supabase-js in supabase-ingest.ts). */
export type Ingest = (batch: Interval[], accessToken: string) => Promise<IngestResult>;

export interface SyncState {
  /** Consecutive failures (index into BACKOFF_MIN). */
  failures: number;
  /** Epoch ms before which cycles are skipped (backoff). */
  notBefore: number;
  /** Shown in the popup footer: "SYNC_ERROR" for client bugs (SYNC-06). */
  lastError: "SYNC_ERROR" | null;
  lastSyncedAt: number | null;
}

const INITIAL: SyncState = { failures: 0, notBefore: 0, lastError: null, lastSyncedAt: null };
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

  async function readState(): Promise<SyncState> {
    const value = (await storage.get(SYNC_STATE_KEY))[SYNC_STATE_KEY];
    return value && typeof value === "object"
      ? { ...INITIAL, ...(value as Partial<SyncState>) }
      : INITIAL;
  }
  const writeState = (state: SyncState) => storage.set({ [SYNC_STATE_KEY]: state });

  async function cycle(
    accessToken: () => Promise<string | null>,
    force: boolean,
  ): Promise<CycleOutcome> {
    const state = await readState();
    if (!force && now() < state.notBefore) return "skipped";
    await outbox.prune(); // SYNC-07/08

    for (;;) {
      const batch = await outbox.batch(SYNC.SYNC_BATCH_MAX);
      if (batch.length === 0) {
        await writeState({
          ...state,
          failures: 0,
          notBefore: 0,
          lastError: null,
          lastSyncedAt: now(),
        });
        return "done";
      }
      const token = await accessToken();
      if (!token) return "not-connected";

      const result = await deps.ingest(batch, token);
      if (result.ok) {
        await outbox.settle(batch, result.confirmedIds); // SYNC-04/05
        state.failures = 0;
        continue; // SYNC-03: repeat while the outbox is not empty
      }

      // SYNC-06
      if (result.kind === "auth") {
        await deps.sessionRejected();
        return "not-connected";
      }
      if (result.kind === "unavailable") {
        const failures = state.failures + 1;
        const minutes = SYNC.BACKOFF_MIN[Math.min(failures, SYNC.BACKOFF_MIN.length) - 1] ?? 30;
        await writeState({ ...state, failures, notBefore: now() + minutes * 60_000 });
      } else {
        // abuse limit: wait an hour; client bug: wait an hour and show "Sync error". Data stays.
        await writeState({
          ...state,
          notBefore: now() + LONG_BACKOFF_MS,
          lastError: result.kind === "client" ? "SYNC_ERROR" : state.lastError,
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
      accessToken: () => Promise<string | null>,
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
