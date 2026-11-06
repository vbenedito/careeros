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
      // Reads storage only; the token's validity is checked by the server on each API call.
      const { data } = await client.auth.getSession();
      return data.session ? toAuthSession(data.session) : null;
    },

    async refresh(): Promise<RefreshResult> {
      const { data, error } = await client.auth.refreshSession();
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
      const temp = ephemeral();
      await temp.auth.setSession({
        access_token: session.accessToken,
        refresh_token: session.refreshToken,
      });
      await temp.auth.signOut({ scope: "local" });
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
