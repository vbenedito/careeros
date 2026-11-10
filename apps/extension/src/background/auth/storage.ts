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
      await area.set({ [key]: minimizeSession(value) });
    },
    async removeItem(key: string): Promise<void> {
      await area.remove(key);
    },
  };
}

/** User fields the extension needs (AUTH-10): who is connected. Nothing else is kept. */
const KEPT_USER_FIELDS = ["id", "aud", "role", "email", "is_anonymous"] as const;

/**
 * SEC-01 (#113): supabase-js stores the whole user with the session, including the OAuth name,
 * avatar and linked identities. The extension needs only the id and the email, so the rest is
 * dropped before anything is written. Anything that is not a session is stored unchanged.
 */
export function minimizeSession(value: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return value;
  }
  if (!parsed || typeof parsed !== "object" || !("user" in parsed)) return value;
  const session = parsed as { user?: unknown };
  if (!session.user || typeof session.user !== "object") return value;
  const user = session.user as Record<string, unknown>;
  const kept: Record<string, unknown> = {};
  for (const field of KEPT_USER_FIELDS) if (field in user) kept[field] = user[field];
  return JSON.stringify({ ...session, user: kept });
}
