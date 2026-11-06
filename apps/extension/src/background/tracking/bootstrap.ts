/**
 * Wires tracking into the worker: the start sequence (TRK-01, TRK-19), storage-driven events
 * (settings, domain list, session) and the LocalData hooks used by AuthService (AUTH-11/12).
 */
import type { LocalData } from "../auth/auth-service";
import { SESSION_STORAGE_KEY } from "../auth/storage";
import { DOMAINS_CACHE_KEY, TRACKING_ENABLED_KEY } from "./keys";
import type { TrackingStore } from "./store";
import type { Tracker } from "./tracker";

/**
 * TRK-01/19: everything the engine needs after a worker start. SETTINGS is always sent
 * (fails closed until then); DOMAINS only once a list has been cached.
 */
export async function startTracking(deps: {
  tracker: Tracker;
  store: TrackingStore;
  isConnected: () => Promise<boolean>;
}): Promise<void> {
  const { tracker, store } = deps;
  await tracker.dispatch({ type: "START" });
  await tracker.dispatch(async () => ({ type: "AUTH", connected: await deps.isConnected() }));
  await tracker.dispatch(async () => ({
    type: "SETTINGS",
    trackingEnabled: await store.trackingEnabled(),
  }));
  const domains = await store.trackedDomains();
  if (domains) await tracker.dispatch({ type: "DOMAINS", domains });
}

type StorageChanges = Record<string, { oldValue?: unknown; newValue?: unknown }>;

/** Turns chrome.storage changes into engine events (popup switch, domain sync, sign-in/out). */
export function createStorageChangeHandler(deps: { tracker: Tracker; store: TrackingStore }) {
  const { tracker, store } = deps;
  return (changes: StorageChanges, areaName: string) => {
    if (areaName !== "local") return;
    if (TRACKING_ENABLED_KEY in changes) {
      void tracker.dispatch(async () => ({
        type: "SETTINGS",
        trackingEnabled: await store.trackingEnabled(),
      }));
    }
    if (DOMAINS_CACHE_KEY in changes) {
      void tracker.dispatch(async () => ({
        type: "DOMAINS",
        domains: (await store.trackedDomains()) ?? [],
      }));
    }
    const session = changes[SESSION_STORAGE_KEY];
    if (session) {
      const connected = session.newValue !== undefined && session.newValue !== null;
      void tracker.dispatch({ type: "AUTH", connected });
    }
  };
}

/**
 * LocalData for AuthService. There is no upload yet (#18): `flush` reports what is still in
 * the outbox, so a disconnect with unsynced intervals is refused instead of losing them.
 */
export function createTrackingLocalData(deps: {
  tracker: Tracker;
  store: TrackingStore;
  isConnected: () => Promise<boolean>;
}): LocalData {
  const { tracker, store } = deps;
  const pending = () => tracker.exclusive(async () => (await store.outbox()).length);
  return {
    flush: pending,
    pendingCount: pending,
    async clear() {
      await tracker.exclusive(() => store.clear());
      // The engine state is gone: replay the start sequence so settings and domains are known.
      await startTracking(deps);
    },
    stopTracking: () => tracker.dispatch({ type: "AUTH", connected: false }),
    resumeTracking: () =>
      tracker.dispatch(async () => ({ type: "AUTH", connected: await deps.isConnected() })),
  };
}
