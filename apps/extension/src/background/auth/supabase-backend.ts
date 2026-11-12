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

/** A refresh of ours that is still running (on time) or that we gave up on (late). */
interface RefreshAttempt {
  /** `sessionGeneration` when it started. */
  generation: number;
  /** The refresh token it was sent with. */
  refreshToken: string;
  /** supabase-js removals held back while it runs on time (AUTH-10a). */
  held: string[];
}

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
   * AUTH-10b: bumped whenever the stored session is replaced or removed by us (adopt, sign-out,
   * clear). A refresh we gave up on may still answer later; its write is applied only if
   * nothing changed the session since it started.
   */
  let sessionGeneration = 0;
  /** Operations of ours running on time: their storage writes are theirs. */
  let foreground = 0;
  /** The refresh running on time, if any. */
  let current: RefreshAttempt | null = null;
  /** Refreshes we gave up on (AUTH-10b) whose request has not settled yet. */
  const late = new Set<RefreshAttempt>();

  /**
   * AUTH-10a (#58): while one of our refreshes runs, supabase-js's own removals of the session
   * are held back. It deletes the session after any non-retryable refresh error once the access
   * token has expired — including a rate limit (429) or a timeout (408), which are temporary.
   * After the refresh, held removals are applied only when the failure really means the session
   * is gone (`refreshFailureReason`).
   *
   * AUTH-10b (grill E1): a write that arrives while none of our operations is running can only
   * come from a refresh we gave up on. It is applied only when the stored session is still the
   * one that refresh started from (a rotated token is worth keeping); a late removal is dropped
   * (the next refresh finds out whether the session is really gone).
   */
  const sessionStorage = createSessionStorage(config.storage);
  const fromLateRefresh = () => foreground === 0 && late.size > 0;
  const guardedStorage = {
    ...sessionStorage,
    async setItem(key: string, value: string) {
      if (fromLateRefresh()) {
        const stored = await readStored();
        const unchanged = [...late].some(
          (attempt) =>
            attempt.generation === sessionGeneration &&
            stored?.refreshToken === attempt.refreshToken,
        );
        if (!unchanged) return;
      }
      await sessionStorage.setItem(key, value);
    },
    async removeItem(key: string) {
      if (current) current.held.push(key);
      else if (fromLateRefresh()) return;
      else await sessionStorage.removeItem(key);
    },
  };

  /** Runs one of our own operations that writes the session through supabase-js. */
  async function inForeground<T>(work: () => Promise<T>): Promise<T> {
    foreground += 1;
    try {
      return await work();
    } finally {
      foreground -= 1;
    }
  }

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
      await inForeground(async () => {
        const { error } = await client.auth.setSession({
          access_token: session.accessToken,
          refresh_token: session.refreshToken,
        });
        if (error) throw error;
      });
    },

    async currentSession() {
      // Read storage directly: supabase-js getSession() would refresh on its own near expiry,
      // bypassing AuthService's refresh rules and its "Reconnect" handling (review of #45).
      return readStored();
    },

    async refresh(): Promise<RefreshResult> {
      const stored = await readStored();
      if (!stored) return { ok: false, reason: "invalid" };
      const attempt: RefreshAttempt = {
        generation: sessionGeneration,
        refreshToken: stored.refreshToken,
        held: [],
      };
      type Answer = Awaited<ReturnType<typeof client.auth.refreshSession>>;
      // The attempt counts as ours until it answers or we give up on it.
      foreground += 1;
      current = attempt;
      // An explicit refresh token makes supabase-js refresh directly and save the new session.
      const request: Promise<Answer> = client.auth.refreshSession({
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
        foreground -= 1;
        if (current === attempt) current = null;
      }
      if (answer === "timeout") {
        // AUTH-10b (grill E1): temporary, the session is kept. Removals held so far are
        // dropped; a late answer may store a rotated token only if nothing changed since.
        late.add(attempt);
        void request
          .catch(() => undefined)
          .finally(() => {
            late.delete(attempt);
          });
        return { ok: false, reason: "unavailable" };
      }
      const { data, error } = answer;
      if (data.session) return { ok: true, session: toAuthSession(data.session) };
      const reason = refreshFailureReason(error);
      // AUTH-10a: a temporary failure keeps the session, even if supabase-js dropped it;
      // a real one lets its removals through (and AuthService shows "Reconnect", AUTH-11).
      if (reason === "invalid") {
        for (const key of attempt.held) await sessionStorage.removeItem(key);
      }
      const stillStored = await readStored();
      return { ok: false, reason: stillStored ? reason : "invalid" };
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
