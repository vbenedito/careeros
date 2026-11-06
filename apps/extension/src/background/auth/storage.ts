/**
 * Session persistence for the extension (AUTH-10, ADR-0002).
 * MV3 service workers have no localStorage and are killed when idle, so everything lives in
 * chrome.storage.local. Only the service worker uses these keys.
 */

/** Storage key under which supabase-js keeps the session (access + refresh token). */
export const SESSION_STORAGE_KEY = "careeros.auth.session";
/** User id that owns the locally stored tracking data (AUTH-11: same-user reconnect). */
export const DATA_OWNER_KEY = "careeros.auth.dataOwner";
/** Set when the session became invalid: the popup shows "Reconnect" (AUTH-11). */
export const NEEDS_RECONNECT_KEY = "careeros.auth.needsReconnect";

/** The subset of chrome.storage.local used here (keeps tests free of the real Chrome API). */
export interface KeyValueArea {
  get(keys: string | string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

/** supabase-js `SupportedStorage` backed by chrome.storage.local. */
export function createSessionStorage(area: KeyValueArea) {
  return {
    async getItem(key: string): Promise<string | null> {
      const value = (await area.get(key))[key];
      return typeof value === "string" ? value : null;
    },
    async setItem(key: string, value: string): Promise<void> {
      await area.set({ [key]: value });
    },
    async removeItem(key: string): Promise<void> {
      await area.remove(key);
    },
  };
}
