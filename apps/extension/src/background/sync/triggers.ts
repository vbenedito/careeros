/**
 * When the worker syncs (SYNC-02) and refreshes the tracked-site list (SYNC-09):
 * - the sync alarm (every SYNC_PERIOD_MIN) runs an upload cycle and refreshes the site list,
 *   so a long-lived worker picks up dashboard edits within one period (SYNC-09, #54);
 * - every write of the stored session (connect, reconnect, token refresh) runs an upload cycle,
 *   but refreshes the site list only when the session's *user* changed (#54): a token refresh
 *   is not a reason to fetch the list again.
 */

/** The user id inside the session value supabase-js stores, or null. */
export function storedSessionUserId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw) as { user?: { id?: unknown } } | null;
    const id = parsed?.user?.id;
    return typeof id === "string" && id.length > 0 ? id : null;
  } catch {
    return null;
  }
}

export function createSyncTriggers(deps: {
  /** One upload cycle (SYNC-02). */
  runSync: () => Promise<unknown>;
  /** SYNC-09: fetch the site list. */
  refreshDomains: () => Promise<unknown>;
}) {
  return {
    /** The `careeros.sync` alarm and worker start. */
    async onAlarm(): Promise<void> {
      await deps.runSync();
      await deps.refreshDomains();
    },

    /** A change of the stored session (chrome.storage change of the session key). */
    async onSessionChange(change: { oldValue?: unknown; newValue?: unknown }): Promise<void> {
      if (change.newValue === undefined) return; // removed: nothing to upload with
      const userChanged =
        storedSessionUserId(change.oldValue) !== storedSessionUserId(change.newValue);
      await deps.runSync();
      if (userChanged) await deps.refreshDomains();
    },
  };
}
