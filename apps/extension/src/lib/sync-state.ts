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
}

export const INITIAL_SYNC_STATE: SyncState = {
  failures: 0,
  notBefore: 0,
  lastOutcome: null,
  lastSyncedAt: null,
};

export function parseSyncState(value: unknown): SyncState {
  return value && typeof value === "object"
    ? { ...INITIAL_SYNC_STATE, ...(value as Partial<SyncState>) }
    : INITIAL_SYNC_STATE;
}
