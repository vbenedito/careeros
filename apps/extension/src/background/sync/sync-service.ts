/**
 * Upload of closed intervals (SYNC-02..06, AUTH-11). One cycle at a time; batches of the
 * oldest ≤ 200 intervals go to `ingest_study_sessions_v2` (SYNC-03a); confirmed ids leave the
 * outbox, the rest of the batch is handled by its reason (SYNC-05c): `future` deferred,
 * `overlap` dropped and counted, `invalid` quarantined. Failures back off and never discard data.
 */
import { DATA, type IngestRejectReason, type Interval, SYNC } from "@careeros/shared";
import { errorKind } from "../../lib/error-kind";
import type { Logger } from "../../lib/log";
import { parseSyncState, SYNC_STATE_KEY, type SyncState } from "../../lib/sync-state";
import type { AccountEpoch } from "../account-epoch";
import type { TokenProvider } from "../auth/auth-service";
import type { KeyValueArea } from "../auth/storage";
import type { Outbox } from "../tracking/outbox";

export type IngestResult =
  | {
      ok: true;
      confirmedIds: string[];
      /** SYNC-05c: rejected ids with their reason; an id in neither list counts as `invalid`. */
      rejected?: { id: string; reason: IngestRejectReason }[];
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
  log?: Logger;
}) {
  const { outbox, storage, now } = deps;
  const timers = deps.timers ?? globalThis;
  let running: Promise<CycleOutcome> | null = null;

  const readState = async () => parseSyncState((await storage.get(SYNC_STATE_KEY))[SYNC_STATE_KEY]);

  /**
   * SYNC-05c: every write of the sync status runs one at a time and keeps the stored
   * `overlapDroppedS`, which only `addOverlap` and `dismissOverlap` change. A cycle holds an
   * older copy of the status; without this it would write back a count the popup dismissed
   * meanwhile.
   */
  let stateChain: Promise<unknown> = Promise.resolve();
  function serialized<T>(task: () => Promise<T>): Promise<T> {
    const run = stateChain.then(task, task);
    stateChain = run.catch(() => {});
    return run;
  }
  const persist = (next: SyncState) =>
    serialized(async () => {
      const { overlapDroppedS } = await readState();
      await storage.set({ [SYNC_STATE_KEY]: { ...next, overlapDroppedS } });
    });
  /** Adds to (or, negative, subtracts from) the stored count; never below 0. */
  const changeOverlap = (deltaS: number) =>
    serialized(async () => {
      const raw = (await storage.get(SYNC_STATE_KEY))[SYNC_STATE_KEY];
      // Nothing stored and nothing to add: a disconnected profile gets no sync status (#113).
      if (raw === undefined && deltaS <= 0) return;
      const stored = parseSyncState(raw);
      const overlapDroppedS = Math.max(0, stored.overlapDroppedS + deltaS);
      await storage.set({ [SYNC_STATE_KEY]: { ...stored, overlapDroppedS } });
    });

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
      if (!stale()) await persist({ ...next, syncingSince: null });
    };
    if (!force && now() < state.notBefore) return "skipped";
    let marked = false;
    let missingTimeLogged = false;
    try {
      await outbox.prune(); // SYNC-07/08

      for (;;) {
        const batch = await outbox.batch(
          state.probeNext ? 1 : SYNC.SYNC_BATCH_MAX,
          state.serverSkewMs,
        );
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
            lastErrorKind: null,
          });
          return "done";
        }
        if (!marked && !stale()) {
          // SYNC-02c (#58): the popup shows "Syncing…" while this is recent.
          await persist({ ...state, syncingSince: now() });
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
          if (serverNow === null && !missingTimeLogged) {
            // SYNC-05a: without the server's time, future-dated rejections are quarantined.
            deps.log?.warn("sync.server_time_unavailable", {});
            missingTimeLogged = true;
          }
          if (serverNow !== null) state.serverSkewMs = now() - serverNow;
          const confirmed = new Set(result.confirmedIds);
          const reasons = new Map<string, IngestRejectReason>(
            (result.rejected ?? [])
              .filter((r) => !confirmed.has(r.id))
              .map((r) => [r.id, r.reason]),
          );
          const reasonOf = (i: Interval) => reasons.get(i.id) ?? "invalid";
          const rejected = batch.filter((i) => !confirmed.has(i.id));
          // SYNC-05b (#56), SYNC-05c: "nothing confirmed" for several intervals, all `invalid`,
          // looks like a server bug, not per-row rejections: a call error (nothing quarantined);
          // the next cycle probes with the oldest interval alone. One `overlap` or `future`
          // among them means the server judged each row: handled by reason, never a backoff.
          if (
            confirmed.size === 0 &&
            rejected.length > 1 &&
            rejected.every((i) => reasonOf(i) === "invalid")
          ) {
            await writeState({
              ...state,
              notBefore: now() + LONG_BACKOFF_MS,
              lastOutcome: "error",
              probeNext: true,
            });
            return "failed";
          }
          // SYNC-04/05/05a/05c
          const settled = await outbox.settle(batch, result.confirmedIds, serverNow, reasons);
          if (settled.overlapDroppedS > 0) {
            // SYNC-05c: counted at once, so a later failure of the cycle cannot lose it.
            if (stale()) return "not-connected";
            await changeOverlap(settled.overlapDroppedS);
          }
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
    } catch (error) {
      // A local store task that timed out (TRK-17a) or failed: nothing was settled; try again
      // next cycle. The "syncing" marker is taken back and the error's kind kept (SYNC-06b).
      const kind = errorKind(error);
      deps.log?.warn("sync.cycle_error", { kind });
      try {
        await writeState({ ...state, lastErrorKind: kind });
      } catch {
        // storage itself failed: nothing more to record
      }
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
     * SYNC-02b (#58, #65): resolves `true` once no cycle is running, or `false` when one is
     * still running after `timeoutMs` (a long multi-batch upload). Disconnect waits here
     * *before* taking the auth lock, so its final sync is not skipped because of a cycle that
     * was already uploading; still running → SYNC_IN_PROGRESS (AUTH-12b).
     */
    async waitIdle(timeoutMs: number): Promise<boolean> {
      if (!running) return true;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const idle = await Promise.race([
        running.then(
          () => true,
          () => true,
        ),
        new Promise<boolean>((resolve) => {
          timer = timers.setTimeout(() => resolve(false), timeoutMs);
        }),
      ]);
      timers.clearTimeout(timer);
      return idle;
    },
    status: readState,
    /**
     * SYNC-05c: the popup dismissed its clock-moved-back line showing `shownS` seconds. Only that
     * value is subtracted, so time dropped after the popup rendered is kept and shown next.
     */
    dismissOverlap(shownS: number): Promise<void> {
      if (!Number.isFinite(shownS) || shownS <= 0) return Promise.resolve();
      return changeOverlap(-shownS);
    },
  };
}

export type SyncService = ReturnType<typeof createSyncService>;
