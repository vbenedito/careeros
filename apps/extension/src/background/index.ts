/**
 * Service worker entry (MV3). Owns the extension session (AUTH-10), answers the dashboard
 * (AUTH-07) and runs tracking (TRK-12..19). Sync (#18) is wired here when it lands.
 *
 * Every listener is registered synchronously at startup so Chrome events can wake the worker.
 */
import { TRACKING } from "@careeros/shared";
import { config, isSupabaseConfigured } from "../lib/config";
import { IS_DEV_BUILD } from "../lib/env";
import { createLogger } from "../lib/log";
import { createDataClient } from "./api/data-client";
import { createAuthService } from "./auth/auth-service";
import { SESSION_STORAGE_KEY } from "./auth/storage";
import { createSupabaseAuthBackend } from "./auth/supabase-backend";
import { createDomainService } from "./domains/domain-service";
import { createSupabaseDomainsApi } from "./domains/supabase-domains";
import { createExternalMessageHandler } from "./messaging/external";
import { createInternalMessageHandler } from "./messaging/internal";
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
import { createTrackingStore } from "./tracking/store";
import { createTracker } from "./tracking/tracker";

const storage = chrome.storage.local;
const log = createLogger({ debug: IS_DEV_BUILD });

// --- Tracking -------------------------------------------------------------------------------
const store = createTrackingStore(storage);
const port = createChromeBrowserPort(chrome);
const tracker = createTracker({
  store,
  browser: port,
  env: createEngineEnv(storage),
  now: () => Date.now(),
  log,
  idleThresholdS: TRACKING.IDLE_THRESHOLD_S,
});
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
const localData = createTrackingLocalData({ tracker, store, isConnected: hasSession });
const auth = backend
  ? createAuthService({ backend, storage, localData, now: () => Date.now() })
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
    })
  : null;

/** SYNC-09: refresh on startup, after connecting and when the popup opens. */
const refreshDomains = async () => {
  const result = await domains?.refresh();
  if (result && !result.ok && result.error !== "NOT_CONNECTED") {
    log.warn("domains.refresh_failed", { error: result.error });
  }
};
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[SESSION_STORAGE_KEY]?.newValue !== undefined) {
    void refreshDomains();
  }
});

const handleInternal = domains
  ? createInternalMessageHandler({ extensionId: chrome.runtime.id, domains })
  : null;
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!handleInternal) return false;
  handleInternal(message, { id: sender.id, tab: sender.tab }).then(
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
  .then(refreshDomains)
  .catch(() => log.error("tracking.start_failed", {}));
