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
export function createStorageChangeHandler(deps: {
  tracker: Tracker;
  store: TrackingStore;
  isConnected: () => Promise<boolean>;
}) {
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
    if (SESSION_STORAGE_KEY in changes) {
      // Same definition of "connected" everywhere: a valid stored session.
      void tracker.dispatch(async () => ({ type: "AUTH", connected: await deps.isConnected() }));
    }
  };
}

/** LocalData for AuthService: tracking stop/resume, final upload, counts and local clear. */
export function createTrackingLocalData(deps: {
  tracker: Tracker;
  store: TrackingStore;
  isConnected: () => Promise<boolean>;
  /** Final upload attempt with the given token provider (sync, #18). */
  upload?: (accessToken: () => Promise<string | null>) => Promise<unknown>;
  /** SYNC-02b: bounded wait for a sync cycle that is already running (before the auth lock). */
  waitForUpload?: () => Promise<boolean>;
  /** #113: a new device id for the next account on this profile. */
  forgetDevice?: () => Promise<void>;
}): LocalData & { isConnected: () => Promise<boolean> } {
  const { tracker, store } = deps;
  /** Set by stopTracking: nothing (e.g. a start sequence) may report "connected" meanwhile. */
  let stopped = false;
  const isConnected = async () => !stopped && (await deps.isConnected());
  const counts = () => tracker.exclusive(() => store.localCounts());
  const pending = async () => (await counts()).unsynced;
  return {
    async flush(accessToken) {
      const outcome = await deps.upload?.(accessToken);
      // AUTH-12c: "skipped" = a cycle was already running, so the final sync did not run.
      return { remaining: await pending(), skipped: outcome === "skipped" };
    },
    pendingCount: pending,
    quarantinedCount: async () => (await counts()).quarantined,
    waitForUpload: async () => (await deps.waitForUpload?.()) ?? true,
    async clear() {
      stopped = false;
      await tracker.exclusive(async () => {
        await store.clear();
        await deps.forgetDevice?.();
      });
      // The engine state is gone: replay the start sequence so settings are known again.
      await startTracking({ tracker, store, isConnected });
    },
    async stopTracking() {
      stopped = true;
      if (!(await tracker.dispatch({ type: "AUTH", connected: false }))) {
        throw new Error("could not close the open interval");
      }
    },
    async resumeTracking() {
      stopped = false;
      await tracker.dispatch(async () => ({ type: "AUTH", connected: await isConnected() }));
    },
    /** Connected and not stopped: what the worker's own start sequence must use. */
    isConnected,
  };
}
