/**
 * Upload of closed intervals (SYNC-02..06, AUTH-11). One cycle at a time; batches of the
 * oldest ≤ 200 intervals go to `ingest_study_sessions`; confirmed ids leave the outbox, the
 * rest of the batch is deferred (ended in the future by the server's clock) or quarantined.
 * Failures back off and never discard data.
 */
import { DATA, type Interval, SYNC } from "@careeros/shared";
import { parseSyncState, SYNC_STATE_KEY, type SyncState } from "../../lib/sync-state";
import type { AccountEpoch } from "../account-epoch";
import type { TokenProvider } from "../auth/auth-service";
import type { KeyValueArea } from "../auth/storage";
import { endedInServerFuture, type Outbox } from "../tracking/outbox";

export type IngestResult =
  | {
      ok: true;
      confirmedIds: string[];
      /** The server's clock when it answered (epoch ms, from the `Date` header), if known. */
      serverNow?: number | null;
    }
  /** `expired`: the server says the access token expired (device clock behind): refresh, retry. */
  | { ok: false; kind: "unavailable" | "abuse" | "auth" | "client" | "expired" };

/** The RPC call (implemented with supabase-js in supabase-ingest.ts). */
export type Ingest = (
  batch: Interval[],
  accessToken: string,
  signal?: AbortSignal,
) => Promise<IngestResult>;

const LONG_BACKOFF_MS = 60 * 60_000;
/** SYNC-06a (#58): a call that has not answered by then is a network error. */
export const INGEST_TIMEOUT_MS = SYNC.INGEST_TIMEOUT_S * 1000;

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
  /** #113: a cycle that outlives a change of account writes nothing. */
  epoch?: AccountEpoch;
  /** Whether a session is stored, without the auth lock or the network. */
  isConnected: () => Promise<boolean>;
  timers?: Pick<typeof globalThis, "setTimeout" | "clearTimeout">;
}) {
  const { outbox, storage, now } = deps;
  const timers = deps.timers ?? globalThis;
  let running: Promise<CycleOutcome> | null = null;

  const readState = async () => parseSyncState((await storage.get(SYNC_STATE_KEY))[SYNC_STATE_KEY]);

  /** SYNC-06a: the ingest call, aborted and counted as "unavailable" after the timeout. */
  async function ingestWithTimeout(batch: Interval[], token: string): Promise<IngestResult> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<IngestResult>((resolve) => {
      timer = timers.setTimeout(() => {
        controller.abort();
        resolve({ ok: false, kind: "unavailable" });
      }, INGEST_TIMEOUT_MS);
    });
    try {
      return await Promise.race([
        deps
          .ingest(batch, token, controller.signal)
          .catch((): IngestResult => ({ ok: false, kind: "unavailable" })),
        timeout,
      ]);
    } finally {
      timers.clearTimeout(timer);
    }
  }

  async function cycle(accessToken: TokenProvider, force: boolean): Promise<CycleOutcome> {
    const started = deps.epoch?.current();
    const stale = () => deps.epoch !== undefined && deps.epoch.current() !== started;
    const state = await readState();
    // Every write of this cycle ends the "syncing" marker (SYNC-02c).
    const writeState = async (next: SyncState) => {
      if (!stale()) await storage.set({ [SYNC_STATE_KEY]: { ...next, syncingSince: null } });
    };
    if (!force && now() < state.notBefore) return "skipped";
    let marked = false;
    try {
      await outbox.prune(); // SYNC-07/08

      for (;;) {
        const batch = await outbox.batch(state.probeNext ? 1 : SYNC.SYNC_BATCH_MAX);
        if (batch.length === 0) {
          // Nothing to upload is only "synced" for a connected account: a disconnected profile
          // must not grow a sync status of its own (#113, AUTH-11a). A storage read, not a
          // token: an offline Disconnect must not wait for a refresh it does not need.
          if (!(await deps.isConnected())) {
            if (marked) await writeState(state);
            return "not-connected";
          }
          await writeState({
            ...state,
            failures: 0,
            notBefore: 0,
            lastOutcome: "ok",
            lastSyncedAt: now(),
          });
          return "done";
        }
        if (!marked && !stale()) {
          // SYNC-02c (#58): the popup shows "Syncing…" while this is recent.
          await storage.set({ [SYNC_STATE_KEY]: { ...state, syncingSince: now() } });
          marked = true;
        }
        let token = await accessToken();
        if (!token) {
          if (stale()) return "not-connected";
          // A refresh that failed for a temporary reason (offline, 429) keeps the session:
          // back off like any network error (AUTH-11a). Otherwise the session is gone; if
          // getting the token invalidated it, the epoch moved and this write is skipped.
          if (await deps.isConnected()) return await backOff(state, writeState);
          await writeState({ ...state, lastOutcome: "not-connected" });
          return "not-connected";
        }

        let result = await ingestWithTimeout(batch, token);
        if (!result.ok && result.kind === "expired") {
          // Not a revoked session (AUTH-11): refresh once and retry.
          token = await accessToken({ forceRefresh: true });
          result = token
            ? await ingestWithTimeout(batch, token)
            : { ok: false, kind: "unavailable" };
        }
        // The account changed while the batch was in flight: its outbox is gone, settle nothing.
        if (stale()) return "not-connected";
        if (result.ok) {
          const serverNow = result.serverNow ?? null;
          const confirmed = new Set(result.confirmedIds);
          const rejected = batch.filter((i) => !confirmed.has(i.id));
          const future = rejected.filter((i) => endedInServerFuture(i, serverNow));
          // SYNC-05b (#56): "nothing confirmed" for several intervals that cannot all be
          // explained by the clock looks like a server bug, not per-row rejections: a call
          // error (nothing quarantined); the next cycle probes with the oldest interval alone.
          if (confirmed.size === 0 && rejected.length - future.length > 1) {
            await writeState({
              ...state,
              notBefore: now() + LONG_BACKOFF_MS,
              lastOutcome: "error",
              probeNext: true,
            });
            return "failed";
          }
          const settled = await outbox.settle(batch, result.confirmedIds, serverNow); // SYNC-04/05
          state.failures = 0;
          state.probeNext = false;
          // SYNC-05a: remember how far ahead this device's clock is while it causes rejections
          // (not when the clock is fine now and only old, wrongly dated intervals were deferred).
          const skew = serverNow === null ? 0 : now() - serverNow;
          state.clockAheadMs =
            settled.deferred > 0 && skew > DATA.FUTURE_TOLERANCE_S * 1000 ? skew : null;
          continue; // SYNC-03: repeat while the outbox is not empty
        }

        // SYNC-06
        if (result.kind === "auth") {
          // Written first: sessionRejected starts a new account epoch (#113).
          await writeState({ ...state, lastOutcome: "not-connected" });
          await deps.sessionRejected();
          return "not-connected";
        }
        if (result.kind === "unavailable" || result.kind === "expired") {
          return await backOff(state, writeState);
        }
        // Abuse limit or a malformed call (bug): wait an hour. Data is never dropped.
        await writeState({
          ...state,
          notBefore: now() + LONG_BACKOFF_MS,
          lastOutcome: result.kind === "abuse" ? "abuse" : "error",
        });
        return "failed";
      }
    } catch {
      // A local store task that timed out (TRK-17a) or failed: nothing was settled; try again
      // next cycle. Only the "syncing" marker is taken back.
      if (marked) await writeState(state);
      return "failed";
    }
  }

  /** SYNC-06: network-class failure, backoff per BACKOFF_MIN. */
  async function backOff(
    state: SyncState,
    writeState: (next: SyncState) => Promise<void>,
  ): Promise<CycleOutcome> {
    const failures = state.failures + 1;
    const minutes = SYNC.BACKOFF_MIN[Math.min(failures, SYNC.BACKOFF_MIN.length) - 1] ?? 30;
    await writeState({
      ...state,
      failures,
      notBefore: now() + minutes * 60_000,
      lastOutcome: "offline",
    });
    return "failed";
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
    /**
     * SYNC-02b (#58, #65): resolves when no cycle is running, or after `timeoutMs`. Disconnect
     * waits here *before* taking the auth lock, so its final sync is not skipped because of a
     * cycle that was already uploading.
     */
    async waitIdle(timeoutMs: number): Promise<void> {
      if (!running) return;
      let timer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        running.then(
          () => undefined,
          () => undefined,
        ),
        new Promise<void>((resolve) => {
          timer = timers.setTimeout(resolve, timeoutMs);
        }),
      ]);
      timers.clearTimeout(timer);
    },
    status: readState,
  };
}

export type SyncService = ReturnType<typeof createSyncService>;
