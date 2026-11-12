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
}

export const INITIAL_SYNC_STATE: SyncState = {
  failures: 0,
  notBefore: 0,
  lastOutcome: null,
  lastSyncedAt: null,
  syncingSince: null,
  clockAheadMs: null,
  probeNext: false,
};

/** A cycle older than this is from a worker that was killed: not "syncing" any more. */
export const SYNCING_STALE_MS = 2 * 60_000;

export function parseSyncState(value: unknown): SyncState {
  return value && typeof value === "object"
    ? { ...INITIAL_SYNC_STATE, ...(value as Partial<SyncState>) }
    : INITIAL_SYNC_STATE;
}

/** SYNC-02c: whether the popup should show "Syncing…" (EXT-UI footer). */
export function isSyncing(state: SyncState, now: number): boolean {
  return (
    state.syncingSince !== null &&
    now >= state.syncingSince - 5_000 &&
    now - state.syncingSince < SYNCING_STALE_MS
  );
}
