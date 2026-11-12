/**
 * AuthBackend implemented with supabase-js. Only the service worker creates this (AUTH-10).
 */

import { AUTH } from "@careeros/shared";
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

/** AUTH-10b (grill E1): a refresh that has not answered by then is a temporary failure. */
export const REFRESH_TIMEOUT_MS = AUTH.REFRESH_TIMEOUT_S * 1000;

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
  /** Tests only: AUTH-10b timeout. */
  refreshTimeoutMs?: number;
  timers?: Pick<typeof globalThis, "setTimeout" | "clearTimeout">;
}): AuthBackend & { client: SupabaseClient } {
  const { supabaseUrl, publishableKey } = config;
  const timers = config.timers ?? globalThis;
  const refreshTimeoutMs = config.refreshTimeoutMs ?? REFRESH_TIMEOUT_MS;

  const readStored = async () =>
    parseStoredSession((await config.storage.get(SESSION_STORAGE_KEY))[SESSION_STORAGE_KEY]);

  /**
   * AUTH-10b (grill E1, review of #163): bumped synchronously whenever the stored session is
   * replaced or removed (adopt, sign-out, clear, a refresh's own write). A refresh writes its
   * result only if the generation is still the one it started with (compare-and-set).
   */
  let sessionGeneration = 0;
  /** Adopts in progress: the only time the persistent client may write the session. */
  let adopting = 0;

  /**
   * The persistent client is used only to adopt a session (AUTH-07b). Refreshes run on a
   * non-persisting client and the worker stores their result itself (AUTH-10a/10b), so any
   * other write or removal the persistent client attempts on its own (e.g. its startup
   * recovery) is dropped: it can never overwrite or delete a session behind the worker's back.
   */
  const sessionStorage = createSessionStorage(config.storage);
  const guardedStorage = {
    ...sessionStorage,
    async setItem(key: string, value: string) {
      if (adopting > 0) await sessionStorage.setItem(key, value);
    },
    async removeItem(key: string) {
      if (adopting > 0) await sessionStorage.removeItem(key);
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
    sessionGeneration += 1;
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
      sessionGeneration += 1;
      adopting += 1;
      try {
        const { error } = await client.auth.setSession({
          access_token: session.accessToken,
          refresh_token: session.refreshToken,
        });
        if (error) throw error;
      } finally {
        adopting -= 1;
      }
    },

    async currentSession() {
      // Read storage directly: supabase-js getSession() would refresh on its own near expiry,
      // bypassing AuthService's refresh rules and its "Reconnect" handling (review of #45).
      return readStored();
    },

    async refresh(): Promise<RefreshResult> {
      const stored = await readStored();
      if (!stored) return { ok: false, reason: "invalid" };
      const generation = sessionGeneration;
      /** Compare-and-set: still the session this refresh started from (checked synchronously). */
      const unchanged = () => sessionGeneration === generation;

      // AUTH-10a/10b: refresh on a client that persists nothing. supabase-js can then neither
      // store a result we gave up on nor delete the session after a temporary error; the
      // worker alone decides what is written.
      type Answer = Awaited<ReturnType<SupabaseClient["auth"]["refreshSession"]>>;
      const request: Promise<Answer> = ephemeral().auth.refreshSession({
        refresh_token: stored.refreshToken,
      });
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timedOut = new Promise<"timeout">((resolve) => {
        timer = timers.setTimeout(() => resolve("timeout"), refreshTimeoutMs);
      });
      let answer: Answer | "timeout";
      try {
        answer = await Promise.race([request, timedOut]);
      } finally {
        timers.clearTimeout(timer);
      }
      if (answer === "timeout") {
        // AUTH-10b (grill E1): temporary, the session is kept. A late answer is never written
        // (the server's parent-token rule recovers a rotation we did not store, AUTH-10).
        void request.catch(() => undefined);
        return { ok: false, reason: "unavailable" };
      }

      const { data, error } = answer;
      if (data.session) {
        const next = data.session;
        // Under the auth lock; the check and the write's start are in the same synchronous
        // step, and every change of session bumps the generation synchronously first.
        if (!unchanged() || next.user?.id !== stored.userId)
          return { ok: false, reason: "unavailable" };
        sessionGeneration += 1;
        await sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(next));
        return { ok: true, session: toAuthSession(next) };
      }
      // The session was replaced meanwhile: this answer is about one we no longer hold.
      if (!unchanged()) return { ok: false, reason: "unavailable" };
      const reason = refreshFailureReason(error);
      // AUTH-10a: a temporary failure keeps the session; a real one removes it (and
      // AuthService shows "Reconnect", AUTH-11).
      if (reason === "invalid") await removeStoredSession();
      return { ok: false, reason };
    },

    async signOutLocal() {
      // AUTH-12: the local session is removed first and always. Revoking it on the server
      // (this session only, never the dashboard's) is best effort and bounded: offline,
      // supabase-js would first retry refreshing an expired token for a long time.
      const stored = await readStored();
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
