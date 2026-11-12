/**
 * Service worker entry (MV3). Owns the extension session (AUTH-10), answers the dashboard
 * (AUTH-07) and runs tracking (TRK-12..19). Sync (#18) is wired here when it lands.
 *
 * Every listener is registered synchronously at startup so Chrome events can wake the worker.
 */
// First: before any Zod schema runs (#60).
import "../lib/zod-config";
import { SYNC, TRACKING } from "@careeros/shared";
import { localDayStartMs } from "../engine/engine";
import { config, isSupabaseConfigured } from "../lib/config";
import { IS_DEV_BUILD } from "../lib/env";
import { createLogger } from "../lib/log";
import { createAccountEpoch } from "./account-epoch";
import { createDataClient } from "./api/data-client";
import { createAuthService } from "./auth/auth-service";
import { NEEDS_RECONNECT_KEY, SESSION_STORAGE_KEY } from "./auth/storage";
import { createSupabaseAuthBackend } from "./auth/supabase-backend";
import { createBadgeUpdater } from "./badge";
import { createDomainService } from "./domains/domain-service";
import { createSupabaseDomainsApi } from "./domains/supabase-domains";
import { createExternalMessageHandler } from "./messaging/external";
import { createInternalMessageHandler } from "./messaging/internal";
import { createSupabaseIngest } from "./sync/supabase-ingest";
import { createSyncService } from "./sync/sync-service";
import { createSyncTriggers } from "./sync/triggers";
import {
  createStorageChangeHandler,
  createTrackingLocalData,
  startTracking,
} from "./tracking/bootstrap";
import {
  createChromeBrowserPort,
  registerTrackingListeners,
  setUpChromeTracking,
} from "./tracking/chrome-port";
import { createEngineEnv } from "./tracking/device";
import { ENGINE_STATE_KEY, TRACKING_ENABLED_KEY } from "./tracking/keys";
import { createOutbox } from "./tracking/outbox";
import { createTrackingStore, parseEngineState } from "./tracking/store";
import { createTracker } from "./tracking/tracker";

const storage = chrome.storage.local;
const log = createLogger({ debug: IS_DEV_BUILD });

// --- Tracking -------------------------------------------------------------------------------
const accountEpoch = createAccountEpoch();
const store = createTrackingStore(storage, accountEpoch);
const port = createChromeBrowserPort(chrome);
const engineEnv = createEngineEnv(storage);
const tracker = createTracker({
  store,
  browser: port,
  env: engineEnv,
  now: () => Date.now(),
  log,
  idleThresholdS: TRACKING.IDLE_THRESHOLD_S,
});
// --- Toolbar badge (EXT-UI-10) --------------------------------------------------------------
const updateBadge = createBadgeUpdater(chrome.action, chrome.runtime.getManifest().name);
const refreshBadge = async () =>
  updateBadge(parseEngineState((await storage.get(ENGINE_STATE_KEY))[ENGINE_STATE_KEY])).catch(() =>
    log.warn("badge.update_failed", {}),
  );
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && ENGINE_STATE_KEY in changes) void refreshBadge();
});
void refreshBadge();

// --- Auth -----------------------------------------------------------------------------------
const backend = isSupabaseConfigured()
  ? createSupabaseAuthBackend({
      supabaseUrl: config.supabaseUrl,
      publishableKey: config.supabasePublishableKey,
      storage,
    })
  : null;
/** Connected = a valid stored session (same parsing as AuthService; no lock, no network). */
const hasSession = async () => (backend ? (await backend.currentSession()) !== null : false);

// --- Sync (SYNC-01..08) ---------------------------------------------------------------------
const SYNC_ALARM = "careeros.sync";
const outbox = createOutbox({
  area: storage,
  exclusive: tracker.exclusive,
  now: () => Date.now(),
  // SYNC-12a: the engine's own midnight, so "today" matches how intervals were split.
  startOfLocalDay: (t) => localDayStartMs(t),
});
const sync = backend
  ? createSyncService({
      outbox,
      ingest: createSupabaseIngest({
        supabaseUrl: config.supabaseUrl,
        publishableKey: config.supabasePublishableKey,
      }),
      storage,
      now: () => Date.now(),
      sessionRejected: () => auth?.sessionRejected() ?? Promise.resolve(),
      log,
      epoch: accountEpoch,
      isConnected: hasSession,
    })
  : null;

const localData = createTrackingLocalData({
  tracker,
  store,
  isConnected: hasSession,
  // AUTH-12 final sync: ignores backoff, never waits for a cycle that may need the auth lock.
  upload: (accessToken) =>
    sync?.run(accessToken, { force: true, ifIdle: true }) ?? Promise.resolve(),
  // SYNC-02b: before that, wait (bounded) for a cycle that is already uploading.
  waitForUpload: () => sync?.waitIdle(SYNC.DISCONNECT_WAIT_S * 1000) ?? Promise.resolve(true),
  forgetDevice: () => engineEnv.forget(),
});
const auth = backend
  ? createAuthService({ backend, storage, localData, now: () => Date.now(), epoch: accountEpoch })
  : null;

registerTrackingListeners({ api: chrome, port, tracker, timers: globalThis });
chrome.storage.onChanged.addListener(
  createStorageChangeHandler({ tracker, store, isConnected: localData.isConnected }),
);

if (!auth) log.warn("config.supabase_missing", { hint: "run pnpm setup:env and rebuild" });

// --- Tracked domains (SYNC-09..11) ----------------------------------------------------------
const domains = auth
  ? createDomainService({
      api: createSupabaseDomainsApi(
        createDataClient({
          supabaseUrl: config.supabaseUrl,
          publishableKey: config.supabasePublishableKey,
          accessToken: () => auth.accessToken(),
        }),
      ),
      storage,
      isConnected: hasSession,
      sessionRejected: () => auth.sessionRejected(),
      now: () => Date.now(),
      epoch: accountEpoch,
    })
  : null;

/** SYNC-09: refresh on startup, each sync cycle, when the user changes and on popup open. */
const refreshDomains = async () => {
  const result = await domains?.refresh();
  if (result && !result.ok && result.error !== "NOT_CONNECTED") {
    log.warn("domains.refresh_failed", { error: result.error });
  }
};

/** SYNC-02: one upload cycle. */
const runSync = async () => {
  if (!sync || !auth) return;
  const outcome = await sync.run(() => auth.accessToken());
  log.debug("sync.cycle", { outcome });
};
const triggers = createSyncTriggers({ runSync, refreshDomains });
const syncNow = () => triggers.onAlarm().catch(() => log.warn("sync.cycle_failed", {}));

chrome.storage.onChanged.addListener((changes, area) => {
  const change = changes[SESSION_STORAGE_KEY];
  if (area === "local" && change) {
    void triggers.onSessionChange(change).catch(() => log.warn("sync.cycle_failed", {}));
  }
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SYNC_ALARM) void syncNow();
});

// Created in every build: without Supabase config (dev builds before `pnpm setup:env`) the
// popup's commands get an error reply instead of none (#65, EXT-UI-05c).
const handleInternal = createInternalMessageHandler({
  extensionId: chrome.runtime.id,
  domains,
  // Read without the auth lock (like hasSession): the popup must never wait for a token
  // refresh in flight on a slow network.
  authStatus: async () => {
    const session = await backend?.currentSession();
    const flag = (await storage.get(NEEDS_RECONNECT_KEY))[NEEDS_RECONNECT_KEY] === true;
    return {
      connected: session != null,
      email: session?.email ?? null,
      needsReconnect: session == null && flag,
    };
  },
  // The storage change becomes a SETTINGS event: the engine closes or reopens (EXT-UI-06).
  setTracking: async (enabled) => {
    await storage.set({ [TRACKING_ENABLED_KEY]: enabled });
    return store.trackingEnabled();
  },
  disconnect: async (discardUnsynced) => {
    if (!auth) return { ok: false, code: "FAILED" };
    try {
      // #65: the popup's confirmation also counts rejected ("not synced") intervals.
      const result = await auth.disconnect({ discardUnsynced, includeQuarantined: true });
      if (result.ok) return { ok: true };
      if (result.code === "SYNC_IN_PROGRESS") return { ok: false, code: "SYNC_IN_PROGRESS" };
      return {
        ok: false,
        code: "UNSYNCED_DATA",
        pending: result.unsynced + result.quarantined,
        unsynced: result.unsynced,
        quarantined: result.quarantined,
      };
    } catch {
      return { ok: false, code: "FAILED" };
    }
  },
  forgetLocalData: async () => {
    if (!auth) return { ok: false, code: "FAILED" };
    try {
      return await auth.forgetLocalData();
    } catch {
      return { ok: false, code: "FAILED" };
    }
  },
});
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleInternal(message, { id: sender.id, url: sender.url }).then(
    (reply) => sendResponse(reply ?? undefined),
    () => sendResponse(undefined),
  );
  return true; // reply asynchronously
});

const handleExternal = auth
  ? createExternalMessageHandler({
      auth,
      dashboardOrigin: config.dashboardOrigin,
      extensionVersion: chrome.runtime.getManifest().version,
    })
  : null;

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (!handleExternal) return false;
  handleExternal(message, { origin: sender.origin, id: sender.id }).then(
    (reply) => sendResponse(reply ?? undefined),
    () => sendResponse(undefined),
  );
  return true; // reply asynchronously
});

// --- Start ----------------------------------------------------------------------------------
// Tracking starts even if alarm setup fails (the gap rule covers missing heartbeats).
void setUpChromeTracking(chrome)
  .catch(() => log.error("tracking.setup_failed", {}))
  .then(() => startTracking({ tracker, store, isConnected: localData.isConnected }))
  .then(async () => {
    if (!(await chrome.alarms.get(SYNC_ALARM))) {
      await chrome.alarms.create(SYNC_ALARM, { periodInMinutes: SYNC.SYNC_PERIOD_MIN });
    }
  })
  .then(syncNow)
  .catch(() => log.error("tracking.start_failed", {}));
