/**
 * Service worker entry (MV3). Owns the extension session (AUTH-10) and answers the dashboard
 * (AUTH-07). Tracking (#14–#16) and sync (#18) are wired here as they land.
 */
import { config, isSupabaseConfigured } from "../lib/config";
import { IS_DEV_BUILD } from "../lib/env";
import { createAuthService } from "./auth/auth-service";
import { createSupabaseAuthBackend } from "./auth/supabase-backend";
import { noLocalDataYet } from "./local-data";
import { createExternalMessageHandler } from "./messaging/external";

const storage = chrome.storage.local;

const auth = isSupabaseConfigured()
  ? createAuthService({
      backend: createSupabaseAuthBackend({
        supabaseUrl: config.supabaseUrl,
        publishableKey: config.supabasePublishableKey,
        storage,
      }),
      storage,
      localData: noLocalDataYet,
      now: () => Date.now(),
    })
  : null;

if (!auth && IS_DEV_BUILD) {
  console.warn("[careeros] Supabase is not configured: run `pnpm setup:env` and rebuild");
}

const handleExternal = auth
  ? createExternalMessageHandler({
      auth,
      dashboardOrigin: config.dashboardOrigin,
      extensionVersion: chrome.runtime.getManifest().version,
    })
  : null;

// Listeners must be registered synchronously at startup so a message can wake the worker.
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (!handleExternal) return false;
  handleExternal(message, { origin: sender.origin, id: sender.id }).then(
    (reply) => sendResponse(reply ?? undefined),
    () => sendResponse(undefined),
  );
  return true; // reply asynchronously
});
