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
import { createAuthService } from "./auth/auth-service";
import { SESSION_STORAGE_KEY } from "./auth/storage";
import { createSupabaseAuthBackend } from "./auth/supabase-backend";
import { createExternalMessageHandler } from "./messaging/external";
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
/** Connected = a stored session exists (the auth service owns it, AUTH-10). */
const isConnected = async () =>
  (await storage.get(SESSION_STORAGE_KEY))[SESSION_STORAGE_KEY] !== undefined;

registerTrackingListeners({ api: chrome, port, tracker, timers: globalThis });
chrome.storage.onChanged.addListener(createStorageChangeHandler({ tracker, store }));

// --- Auth and dashboard messaging -----------------------------------------------------------
const auth = isSupabaseConfigured()
  ? createAuthService({
      backend: createSupabaseAuthBackend({
        supabaseUrl: config.supabaseUrl,
        publishableKey: config.supabasePublishableKey,
        storage,
      }),
      storage,
      localData: createTrackingLocalData({ tracker, store, isConnected }),
      now: () => Date.now(),
    })
  : null;

if (!auth) log.warn("config.supabase_missing", { hint: "run pnpm setup:env and rebuild" });

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
void setUpChromeTracking(chrome).then(() => startTracking({ tracker, store, isConnected }));
