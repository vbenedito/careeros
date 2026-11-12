/**
 * AuthBackend implemented with supabase-js. Only the service worker creates this (AUTH-10).
 */
import {
  createClient,
  isAuthApiError,
  isAuthSessionMissingError,
  type Session,
  type SupabaseClient,
} from "@supabase/supabase-js";
import type { AuthBackend, AuthSession, RefreshResult } from "./auth-service";
import { createSessionStorage, type KeyValueArea, SESSION_STORAGE_KEY } from "./storage";

/** Parses the session object supabase-js writes to storage, or null. */
function parseStoredSession(raw: unknown): AuthSession | null {
  if (typeof raw !== "string") return null;
  try {
    const s = JSON.parse(raw) as Partial<Session> & { user?: { id?: string; email?: string } };
    if (!s.access_token || !s.refresh_token || !s.user?.id) return null;
    return {
      accessToken: s.access_token,
      refreshToken: s.refresh_token,
      expiresAt: s.expires_at ?? 0,
      userId: s.user.id,
      email: s.user.email ?? null,
    };
  } catch {
    return null;
  }
}

/** How long a sign-out waits for the server before giving up (the session is already gone locally). */
export const REVOKE_TIMEOUT_MS = 5000;

function toAuthSession(session: Session): AuthSession {
  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: session.expires_at ?? 0,
    userId: session.user.id,
    email: session.user.email ?? null,
  };
}

export function createSupabaseAuthBackend(config: {
  supabaseUrl: string;
  publishableKey: string;
  storage: KeyValueArea;
}): AuthBackend & { client: SupabaseClient } {
  const { supabaseUrl, publishableKey } = config;

  /**
   * AUTH-10a (#58): while one of our refreshes runs, supabase-js's own removals of the session
   * are held back. It deletes the session after any non-retryable refresh error once the access
   * token has expired — including a rate limit (429) or a timeout (408), which are temporary.
   * After the refresh, held removals are applied only when the failure really means the session
   * is gone (`refreshFailureReason`).
   */
  let heldRemovals: string[] | null = null;
  const sessionStorage = createSessionStorage(config.storage);
  const guardedStorage = {
    ...sessionStorage,
    async removeItem(key: string) {
      if (heldRemovals) heldRemovals.push(key);
      else await sessionStorage.removeItem(key);
    },
  };

  // The persistent client: its session lives in chrome.storage.local.
  const client = createClient(supabaseUrl, publishableKey, {
    auth: {
      storage: guardedStorage,
      storageKey: SESSION_STORAGE_KEY,
      persistSession: true,
      // Timers die with the service worker; refresh happens on demand (AUTH-10).
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  // Short-lived clients for checking a token or revoking a session we will not keep.
  const ephemeral = () =>
    createClient(supabaseUrl, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

  /** Best effort: a session we could not revoke still expires on its own. */
  async function discard(session: AuthSession) {
    try {
      const temp = ephemeral();
      await temp.auth.setSession({
        access_token: session.accessToken,
        refresh_token: session.refreshToken,
      });
      await temp.auth.signOut({ scope: "local" });
    } catch {
      // ignore
    }
  }

  async function removeStoredSession() {
    // supabase-js may also keep the user and a PKCE verifier under derived keys.
    await config.storage.remove([
      SESSION_STORAGE_KEY,
      `${SESSION_STORAGE_KEY}-user`,
      `${SESSION_STORAGE_KEY}-code-verifier`,
    ]);
  }

  return {
    client,

    async verifyTokenHash(tokenHash) {
      const { data, error } = await ephemeral().auth.verifyOtp({
        token_hash: tokenHash,
        type: "magiclink",
      });
      if (error || !data.session) throw error ?? new Error("no session");
      return toAuthSession(data.session);
    },

    async adoptSession(session) {
      const { error } = await client.auth.setSession({
        access_token: session.accessToken,
        refresh_token: session.refreshToken,
      });
      if (error) throw error;
    },

    async currentSession() {
      // Read storage directly: supabase-js getSession() would refresh on its own near expiry,
      // bypassing AuthService's refresh rules and its "Reconnect" handling (review of #45).
      const raw = (await config.storage.get(SESSION_STORAGE_KEY))[SESSION_STORAGE_KEY];
      return parseStoredSession(raw);
    },

    async refresh(): Promise<RefreshResult> {
      const stored = parseStoredSession(
        (await config.storage.get(SESSION_STORAGE_KEY))[SESSION_STORAGE_KEY],
      );
      if (!stored) return { ok: false, reason: "invalid" };
      // An explicit refresh token makes supabase-js refresh directly and save the new session.
      const held: string[] = [];
      heldRemovals = held;
      let data: Awaited<ReturnType<typeof client.auth.refreshSession>>["data"];
      let error: unknown;
      try {
        ({ data, error } = await client.auth.refreshSession({
          refresh_token: stored.refreshToken,
        }));
      } finally {
        heldRemovals = null;
      }
      if (data.session) return { ok: true, session: toAuthSession(data.session) };
      const reason = refreshFailureReason(error);
      // AUTH-10a: a temporary failure keeps the session, even if supabase-js dropped it;
      // a real one lets its removals through (and AuthService shows "Reconnect", AUTH-11).
      if (reason === "invalid") {
        for (const key of held) await sessionStorage.removeItem(key);
      }
      const stillStored = parseStoredSession(
        (await config.storage.get(SESSION_STORAGE_KEY))[SESSION_STORAGE_KEY],
      );
      return { ok: false, reason: stillStored ? reason : "invalid" };
    },

    async signOutLocal() {
      // AUTH-12: the local session is removed first and always. Revoking it on the server
      // (this session only, never the dashboard's) is best effort and bounded: offline,
      // supabase-js would first retry refreshing an expired token for a long time.
      const stored = parseStoredSession(
        (await config.storage.get(SESSION_STORAGE_KEY))[SESSION_STORAGE_KEY],
      );
      await removeStoredSession();
      if (stored) {
        await Promise.race([
          discard(stored),
          new Promise((resolve) => setTimeout(resolve, REVOKE_TIMEOUT_MS)),
        ]);
      }
    },

    discardSession: discard,

    clearLocalSession: removeStoredSession,
  };
}

/**
 * AUTH-11: only a client error from Supabase Auth (revoked, reused or unknown refresh token,
 * deleted user, missing session) means the session is gone. Rate limits (429), timeouts (408),
 * server errors and network failures are temporary, whether or not the access token has
 * expired (AUTH-10a): the extension stays connected and retries later.
 */
export function refreshFailureReason(error: unknown): "invalid" | "unavailable" {
  if (isAuthSessionMissingError(error)) return "invalid";
  if (!error || !isAuthApiError(error)) return "unavailable";
  const status = error.status;
  return status >= 400 && status < 500 && status !== 408 && status !== 429
    ? "invalid"
    : "unavailable";
}
