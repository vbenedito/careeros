/**
 * The extension's own Supabase session (AUTH-07b, AUTH-10..12).
 * Pure application logic: Supabase and chrome.storage are injected, so every rule is unit-tested.
 */

import type { AccountEpoch } from "../account-epoch";
import { DOMAINS_CACHE_KEY } from "../tracking/keys";
import { createMutex } from "./mutex";
import { DATA_OWNER_KEY, type KeyValueArea, NEEDS_RECONNECT_KEY } from "./storage";

/** Refresh when the access token expires within this window (AUTH-10). */
export const REFRESH_MARGIN_S = 60;

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  /** Unix seconds. */
  expiresAt: number;
  userId: string;
  email: string | null;
}

export type RefreshResult =
  | { ok: true; session: AuthSession }
  /** The session is no longer valid (revoked, user deleted): reconnect required. */
  | { ok: false; reason: "invalid" }
  /** Network or server problem: keep the session and try again later. */
  | { ok: false; reason: "unavailable" };

/** What the service needs from Supabase Auth (implemented with supabase-js in supabase-backend.ts). */
export interface AuthBackend {
  /** Exchanges a single-use token hash for a new session without storing it. */
  verifyTokenHash(tokenHash: string): Promise<AuthSession>;
  /** Stores `session` as the current session (written to storage before it is used). */
  adoptSession(session: AuthSession): Promise<void>;
  /** The stored session, or null. Does not contact the server. */
  currentSession(): Promise<AuthSession | null>;
  refresh(): Promise<RefreshResult>;
  /** Revokes the current session on the server (best effort) and removes it locally. */
  signOutLocal(): Promise<void>;
  /** Revokes a session that was verified but not adopted. */
  discardSession(session: AuthSession): Promise<void>;
  /** Removes the stored session without contacting the server. */
  clearLocalSession(): Promise<void>;
}

/** Hooks into the sync and tracking modules (#16–#18). */
export interface LocalData {
  /**
   * Tries to upload pending intervals; returns how many remain unsynced.
   * Called while AuthService's (non-reentrant) lock is held, so it must never call back into
   * AuthService: it gets a token provider that works under that lock.
   */
  flush(accessToken: TokenProvider): Promise<number>;
  /** Number of intervals waiting to be uploaded (outbox and deferred). */
  pendingCount(): Promise<number>;
  /** #65: intervals the server rejected (quarantine): never synced, deleted by Disconnect. */
  quarantinedCount?(): Promise<number>;
  /**
   * SYNC-02b (#58, #65): bounded wait for a sync cycle already running. Called by Disconnect
   * *before* it takes the lock (the cycle may need the lock for a token).
   */
  waitForUpload?(): Promise<boolean>;
  /** Deletes all local tracking data (outbox, quarantine, today cache, engine state). */
  clear(): Promise<void>;
  /**
   * Stops tracking and waits until the open interval is closed into the outbox, so the final
   * flush includes it (AUTH-12). `resumeTracking` undoes it when the disconnect is refused.
   */
  stopTracking(): Promise<void>;
  resumeTracking(): Promise<void>;
}

export type ConnectResult =
  | { ok: true; email: string | null }
  | { ok: false; code: "ALREADY_CONNECTED" | "UNSYNCED_DATA" | "INVALID_TOKEN" };

export type DisconnectResult =
  | { ok: true }
  /** #65: what the confirmation states: still unsynced (may upload) and rejected intervals. */
  | { ok: false; code: "UNSYNCED_DATA"; unsynced: number; quarantined: number }
  /**
   * AUTH-12b (#150 review): a sync cycle is still uploading after DISCONNECT_WAIT_S: nothing was
   * changed; the popup says "still syncing" and the user tries again shortly.
   */
  | { ok: false; code: "SYNC_IN_PROGRESS" };

export interface TokenOptions {
  /** Refresh even if the token looks valid locally (the device clock may be behind). */
  forceRefresh?: boolean;
}

/** Gives a valid access token, or null when not connected / temporarily unavailable. */
export type TokenProvider = (options?: TokenOptions) => Promise<string | null>;

export interface AuthStatus {
  connected: boolean;
  email: string | null;
  needsReconnect: boolean;
}

export function createAuthService(deps: {
  backend: AuthBackend;
  storage: KeyValueArea;
  localData: LocalData;
  now: () => number;
  /** #113: bumped when the session is invalidated or a new one is adopted. */
  epoch?: AccountEpoch;
}) {
  const { backend, storage, localData, now } = deps;
  const exclusive = createMutex();

  async function dataOwner(): Promise<string | null> {
    const value = (await storage.get(DATA_OWNER_KEY))[DATA_OWNER_KEY];
    return typeof value === "string" ? value : null;
  }

  /**
   * AUTH-11: forget the session but keep unsynced intervals for a same-user reconnect. The
   * tracked-site list is not needed for that and belongs to the account (#113): it is dropped
   * now and loaded again after reconnecting.
   */
  async function markInvalid(): Promise<void> {
    deps.epoch?.bump();
    await backend.clearLocalSession();
    await storage.set({ [NEEDS_RECONNECT_KEY]: true });
    await storage.remove(DOMAINS_CACHE_KEY);
  }

  /** AUTH-10: the token logic itself; callers must hold the lock. */
  async function accessTokenLocked(options: TokenOptions = {}): Promise<string | null> {
    const session = await backend.currentSession();
    if (!session) return null;
    const fresh = session.expiresAt - now() / 1000 > REFRESH_MARGIN_S;
    if (fresh && !options.forceRefresh) return session.accessToken;
    const result = await backend.refresh();
    if (result.ok) return result.session.accessToken;
    if (result.reason === "invalid") await markInvalid();
    return null;
  }

  return {
    status() {
      return exclusive(async (): Promise<AuthStatus> => {
        const session = await backend.currentSession();
        const flag = (await storage.get(NEEDS_RECONNECT_KEY))[NEEDS_RECONNECT_KEY] === true;
        return {
          connected: session !== null,
          email: session?.email ?? null,
          needsReconnect: session === null && flag,
        };
      });
    },

    /** AUTH-07b, AUTH-11: CONNECT from the dashboard with a single-use token hash. */
    connect(tokenHash: string, options: { discardOtherUsersData?: boolean } = {}) {
      return exclusive(async (): Promise<ConnectResult> => {
        let incoming: AuthSession;
        try {
          incoming = await backend.verifyTokenHash(tokenHash);
        } catch {
          return { ok: false, code: "INVALID_TOKEN" };
        }

        const current = await backend.currentSession();
        if (current) {
          // The new session is not needed either way: revoke it so it does not linger.
          await backend.discardSession(incoming);
          return current.userId === incoming.userId
            ? { ok: true, email: current.email }
            : { ok: false, code: "ALREADY_CONNECTED" };
        }

        const owner = await dataOwner();
        if (owner && owner !== incoming.userId) {
          // Unsynced intervals of the previous user need an explicit "discard" (AUTH-11)...
          if ((await localData.pendingCount()) > 0 && !options.discardOtherUsersData) {
            await backend.discardSession(incoming);
            return { ok: false, code: "UNSYNCED_DATA" };
          }
          // ...and nothing of theirs (today's totals, quarantine) may stay visible to the next
          // user of a shared profile (SEC-01).
          await localData.clear();
        }

        // SYNC-09a (#54): the cached site list belongs to whoever was connected before (after a
        // Disconnect or a rejected session it is gone already): never show it to this account,
        // not even until the first refresh succeeds.
        if (owner !== incoming.userId) await storage.remove(DOMAINS_CACHE_KEY);

        // Before the session is written: its storage event starts a sync cycle, which must
        // already see the new epoch, or it would upload and then discard its own result (#113).
        deps.epoch?.bump();
        try {
          await backend.adoptSession(incoming);
        } catch (error) {
          await backend.discardSession(incoming); // never leave an orphan session behind
          throw error;
        }
        await storage.set({ [DATA_OWNER_KEY]: incoming.userId });
        await storage.remove(NEEDS_RECONNECT_KEY);
        return { ok: true, email: incoming.email };
      });
    },

    /**
     * AUTH-10: a valid access token for an API call, refreshed first when it expires within
     * REFRESH_MARGIN_S. Returns null when not connected or temporarily unavailable.
     */
    /** `forceRefresh`: the server said the token expired although it looks valid here. */
    accessToken(options: TokenOptions = {}) {
      return exclusive(() => accessTokenLocked(options));
    },

    /** AUTH-11: an API call proved the session or the user is gone (401, deleted user). */
    sessionRejected() {
      return exclusive(markInvalid);
    },

    /**
     * AUTH-12: final sync, then sign out and clear local data. `includeQuarantined` (the popup,
     * #65) also asks before deleting rejected intervals; the dashboard does not (they can
     * never sync, so they would block its Disconnect for good).
     */
    async disconnect(
      options: { discardUnsynced?: boolean; includeQuarantined?: boolean } = {},
    ): Promise<DisconnectResult> {
      // SYNC-02b: let a cycle that is already uploading finish first (bounded), outside the
      // lock, so the final sync below is not skipped and reports what really remains.
      const idle = (await localData.waitForUpload?.()) ?? true;
      // Without a discard the result would count intervals that are being uploaded right now.
      if (!idle && !options.discardUnsynced) return { ok: false, code: "SYNC_IN_PROGRESS" };
      return exclusive(async (): Promise<DisconnectResult> => {
        let done = false;
        try {
          await localData.stopTracking();
          const remaining = await localData.flush(accessTokenLocked);
          const quarantined = (await localData.quarantinedCount?.()) ?? 0;
          const toConfirm = remaining + (options.includeQuarantined ? quarantined : 0);
          if (toConfirm > 0 && !options.discardUnsynced)
            return { ok: false, code: "UNSYNCED_DATA", unsynced: remaining, quarantined };
          await backend.signOutLocal();
          await localData.clear();
          await storage.remove([DATA_OWNER_KEY, NEEDS_RECONNECT_KEY]);
          done = true;
          return { ok: true };
        } finally {
          // Refused or failed: keep tracking for the session that is still there.
          if (!done) await localData.resumeTracking();
        }
      });
    },

    /**
     * AUTH-11 explicit discard (#113): while NOT connected (account deleted, signed out
     * everywhere, or someone else's data on a shared profile), the user can delete everything
     * the last account left on this computer, including unsynced intervals. Afterwards any
     * account can connect. Refused while connected: then Disconnect is the way (AUTH-12).
     */
    forgetLocalData() {
      return exclusive(async (): Promise<{ ok: true } | { ok: false; code: "CONNECTED" }> => {
        if (await backend.currentSession()) return { ok: false, code: "CONNECTED" };
        await localData.clear();
        await storage.remove([DATA_OWNER_KEY, NEEDS_RECONNECT_KEY]);
        return { ok: true };
      });
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
