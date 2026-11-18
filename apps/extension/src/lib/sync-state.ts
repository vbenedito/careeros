/**
 * Sync status persisted by the worker and read by the popup footer (SYNC-06, ENV-10).
 * Lives in lib/ so the popup can read it without the worker (EXT-UI-05a).
 */
export const SYNC_STATE_KEY = "careeros.sync.state";

export type SyncOutcome =
  | "ok" // everything uploaded
  | "offline" // network / server unavailable, will retry with backoff
  | "abuse" // server abuse limit: waiting an hour
  | "error" // malformed call (a bug): waiting an hour, shown as "Sync error"
  | "not-connected";

export interface SyncState {
  /** Consecutive failures (index into BACKOFF_MIN). */
  failures: number;
  /** Epoch ms before which cycles are skipped (backoff). */
  notBefore: number;
  lastOutcome: SyncOutcome | null;
  lastSyncedAt: number | null;
  /**
   * SYNC-02c (#58): epoch ms at which the running cycle started uploading, null when no cycle
   * is uploading. A worker killed mid-cycle leaves it set: read it with `isSyncing`.
   */
  syncingSince: number | null;
  /**
   * SYNC-05a (#58, #83): how far this device's clock is ahead of the server's (ms), measured
   * when the last upload had intervals rejected for ending in the future (DATA-07); null
   * otherwise. The popup shows a "check your clock" hint while it is set.
   */
  clockAheadMs: number | null;
  /**
   * SYNC-05b (#56): the server confirmed none of a multi-interval batch (treated as a call
   * error); the next cycle sends the oldest interval alone, so a real per-row rejection is
   * quarantined and the queue moves on.
   */
  probeNext: boolean;
  /**
   * SYNC-05a (#150 review): latest measured difference local − server clock (ms) from an upload
   * response, or null when the server's time has never been available. Deferred intervals are
   * re-evaluated against it every cycle.
   */
  serverSkewMs: number | null;
  /**
   * SYNC-06b (grill H5): coarse kind of the unexpected error that ended the last cycle (class
   * name and known code from `errorKind`, never a message), or null. Cleared when a cycle
   * completes. For diagnostics ("Sync error" support); holds no personal data.
   */
  lastErrorKind: string | null;
  /**
   * SYNC-05c (#179): seconds of intervals the server rejected as `overlap` (same-device overlap,
   * e.g. after the clock moved back, TRK-15) and that were dropped. Grows with each such drop;
   * the popup's dismiss subtracts the value it showed. Reset with the sync status (account
   * change, local data cleared).
   */
  overlapDroppedS: number;
}

export const INITIAL_SYNC_STATE: SyncState = {
  failures: 0,
  notBefore: 0,
  lastOutcome: null,
  lastSyncedAt: null,
  syncingSince: null,
  clockAheadMs: null,
  probeNext: false,
  serverSkewMs: null,
  lastErrorKind: null,
  overlapDroppedS: 0,
};

/** A cycle older than this is from a worker that was killed: not "syncing" any more. */
export const SYNCING_STALE_MS = 2 * 60_000;

export function parseSyncState(value: unknown): SyncState {
  if (!value || typeof value !== "object") return INITIAL_SYNC_STATE;
  const state = { ...INITIAL_SYNC_STATE, ...(value as Partial<SyncState>) };
  const overlap = state.overlapDroppedS;
  return {
    ...state,
    overlapDroppedS:
      typeof overlap === "number" && Number.isFinite(overlap) && overlap > 0 ? overlap : 0,
  };
}

/** SYNC-02c: whether the popup should show "Syncing…" (EXT-UI footer). */
export function isSyncing(state: SyncState, now: number): boolean {
  return (
    state.syncingSince !== null &&
    now >= state.syncingSince - 5_000 &&
    now - state.syncingSince < SYNCING_STALE_MS
  );
}
