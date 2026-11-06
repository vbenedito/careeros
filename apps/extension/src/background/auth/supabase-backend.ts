/**
 * AuthBackend implemented with supabase-js. Only the service worker creates this (AUTH-10).
 */
import {
  createClient,
  isAuthApiError,
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

  // The persistent client: its session lives in chrome.storage.local.
  const client = createClient(supabaseUrl, publishableKey, {
    auth: {
      storage: createSessionStorage(config.storage),
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
      const { data, error } = await client.auth.refreshSession({
        refresh_token: stored.refreshToken,
      });
      if (data.session) return { ok: true, session: toAuthSession(data.session) };
      // An API error (e.g. revoked or reused refresh token) means the session is gone;
      // anything else (offline, 5xx) is temporary.
      return { ok: false, reason: error && isAuthApiError(error) ? "invalid" : "unavailable" };
    },

    async signOutLocal() {
      // Revokes this session only, never the dashboard's (AUTH-12). Clears storage even offline.
      await client.auth.signOut({ scope: "local" });
    },

    async discardSession(session) {
      // Best effort: a session we could not revoke still expires on its own.
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
    },

    async clearLocalSession() {
      // supabase-js may also keep the user and a PKCE verifier under derived keys.
      await config.storage.remove([
        SESSION_STORAGE_KEY,
        `${SESSION_STORAGE_KEY}-user`,
        `${SESSION_STORAGE_KEY}-code-verifier`,
      ]);
    },
  };
}
