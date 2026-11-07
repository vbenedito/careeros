import type {
  AuthBackend,
  AuthSession,
  LocalData,
  RefreshResult,
} from "../background/auth/auth-service";
import type { KeyValueArea } from "../background/auth/storage";

/** In-memory stand-in for chrome.storage.local. */
export function fakeStorage(initial: Record<string, unknown> = {}): KeyValueArea & {
  data: Map<string, unknown>;
} {
  const data = new Map(Object.entries(initial));
  const keys = (k: string | string[]) => (Array.isArray(k) ? k : [k]);
  return {
    data,
    async get(k) {
      return Object.fromEntries(
        keys(k)
          .filter((key) => data.has(key))
          .map((key) => [key, data.get(key)]),
      );
    },
    async set(items) {
      for (const [key, value] of Object.entries(items)) data.set(key, value);
    },
    async remove(k) {
      for (const key of keys(k)) data.delete(key);
    },
  };
}

export const session = (userId: string, overrides: Partial<AuthSession> = {}): AuthSession => ({
  accessToken: `access-${userId}`,
  refreshToken: `refresh-${userId}`,
  expiresAt: 2_000_000_000,
  userId,
  email: `${userId}@example.test`,
  ...overrides,
});

/** Fake Supabase Auth: tokens map to sessions; records every call. */
export function fakeBackend(tokens: Record<string, AuthSession> = {}) {
  const calls: string[] = [];
  let current: AuthSession | null = null;
  let nextRefresh: RefreshResult | null = null;
  const backend: AuthBackend = {
    async verifyTokenHash(tokenHash) {
      calls.push("verify");
      const found = tokens[tokenHash];
      if (!found) throw new Error("invalid token");
      return found;
    },
    async adoptSession(s) {
      calls.push("adopt");
      current = s;
    },
    async currentSession() {
      return current;
    },
    async refresh() {
      calls.push("refresh");
      await new Promise((r) => setTimeout(r, 5)); // let concurrent callers pile up
      const result = nextRefresh ?? { ok: false as const, reason: "unavailable" as const };
      if (result.ok) current = result.session;
      return result;
    },
    async signOutLocal() {
      calls.push("signOut");
      current = null;
    },
    async discardSession() {
      calls.push("discard");
    },
    async clearLocalSession() {
      calls.push("clearSession");
      current = null;
    },
  };
  return {
    backend,
    calls,
    setCurrent: (s: AuthSession | null) => {
      current = s;
    },
    willRefresh: (r: RefreshResult) => {
      nextRefresh = r;
    },
  };
}

export function fakeLocalData(pending = 0, afterFlush = pending) {
  const state = { pending, cleared: 0, calls: [] as string[] };
  const localData: LocalData = {
    flush: async (_accessToken) => {
      state.calls.push("flush");
      state.pending = afterFlush;
      return afterFlush;
    },
    stopTracking: async () => {
      state.calls.push("stop");
    },
    resumeTracking: async () => {
      state.calls.push("resume");
    },
    pendingCount: async () => state.pending,
    clear: async () => {
      state.cleared += 1;
      state.pending = 0;
    },
  };
  return { localData, state };
}
