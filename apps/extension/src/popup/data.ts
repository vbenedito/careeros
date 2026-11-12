/**
 * Everything the popup reads and does, behind one interface so components can be tested with
 * fixtures. Reads come from chrome.storage; commands go to the worker (EXT-UI-05a).
 */
import { isValidDomain } from "@careeros/shared";
import {
  DEFERRED_KEY,
  DOMAINS_CACHE_KEY,
  ENGINE_STATE_KEY,
  OUTBOX_KEY,
  QUARANTINE_KEY,
  SYNCED_TODAY_KEY,
  TRACKING_ENABLED_KEY,
} from "../background/tracking/keys";
import { parseDeferred, parseEngineState, parseOutbox } from "../background/tracking/store";
import { localDayStartMs } from "../engine/engine";
import { config } from "../lib/config";
import {
  POPUP_PORT,
  type PopupAuthStatus,
  type PopupDisconnectResult,
  type PopupForgetResult,
  type PopupRequest,
  type PopupTrackingResult,
} from "../lib/popup-messages";
import type { PopupInput } from "../lib/popup-view";
import { parseSyncState, SYNC_STATE_KEY } from "../lib/sync-state";

const KEYS = {
  engine: ENGINE_STATE_KEY,
  outbox: OUTBOX_KEY,
  deferred: DEFERRED_KEY,
  quarantine: QUARANTINE_KEY,
  syncedToday: SYNCED_TODAY_KEY,
  trackingEnabled: TRACKING_ENABLED_KEY,
  domains: DOMAINS_CACHE_KEY,
} as const;

export type CommandResult = { ok: true } | { ok: false; error: string };
/** EXT-UI-05c (#65): the switch shows the worker's stored value; no reply is an error. */
export type TrackingResult = { ok: true; enabled: boolean } | { ok: false; error: string };

export interface PopupData {
  /** Everything except `now`, which the view adds every second. */
  load(): Promise<Omit<PopupInput, "now">>;
  /**
   * Epoch ms of the local midnight that starts the day of `now` (SYNC-12a: the engine's
   * calendar). The popup recomputes it every tick, so it rolls over at midnight (#60).
   */
  dayStart(now: number): number;
  /** Calls back whenever the worker changes what the popup shows. */
  subscribe(onChange: () => void): () => void;
  addSite(input: string): Promise<CommandResult>;
  removeSite(domain: string): Promise<CommandResult>;
  /** EXT-UI-06: per-device tracking switch; replies with the value stored afterwards. */
  setTracking(enabled: boolean): Promise<TrackingResult>;
  /** AUTH-12: refused with UNSYNCED_DATA unless `discardUnsynced`. */
  disconnect(discardUnsynced: boolean): Promise<PopupDisconnectResult>;
  /** AUTH-11 explicit discard while no account is connected (#113). */
  forgetLocalData(): Promise<PopupForgetResult>;
  refreshSites(): Promise<void>;
  openDashboard(path?: string): void;
  /** Tells the worker the popup is open (not "left Chrome", TRK-04); returns a closer. */
  holdFocus(): () => void;
  version: string;
}

function send<T>(message: PopupRequest): Promise<T | undefined> {
  return chrome.runtime.sendMessage(message).catch(() => undefined) as Promise<T | undefined>;
}

export function createChromePopupData(): PopupData {
  return {
    version: chrome.runtime.getManifest().version,

    async load() {
      const [stored, auth, [tab]] = await Promise.all([
        chrome.storage.local.get([...Object.values(KEYS), SYNC_STATE_KEY]),
        send<PopupAuthStatus>({ type: "AUTH_STATUS" }),
        chrome.tabs.query({ active: true, currentWindow: true }),
      ]);
      // SYNC-12a: the engine's own midnight, so "today" matches how intervals were split.
      const today = localDayStartMs(Date.now());
      const outbox = parseOutbox(stored[KEYS.outbox]);
      // SYNC-05a: waiting for the server's clock; still pending upload, still today's time.
      const deferred = parseDeferred(stored[KEYS.deferred]).items.map((d) => d.interval);
      const synced = parseOutbox(stored[KEYS.syncedToday]);
      const domains = stored[KEYS.domains] as { domains?: unknown } | undefined;
      return {
        startOfToday: today,
        auth: { connected: auth?.connected ?? false, email: auth?.email ?? null },
        trackingEnabled: stored[KEYS.trackingEnabled] !== false,
        // #113: only valid domains from storage (written by the worker, validated there too).
        trackedDomains: Array.isArray(domains?.domains)
          ? domains.domains.filter((d): d is string => typeof d === "string" && isValidDomain(d))
          : null,
        engine: parseEngineState(stored[KEYS.engine]),
        todayIntervals: [...synced, ...outbox, ...deferred].filter(
          (i) => Date.parse(i.started_at) >= today,
        ),
        sync: parseSyncState(stored[SYNC_STATE_KEY]),
        counts: {
          pending: outbox.length + deferred.length,
          deferred: deferred.length,
          quarantined: parseOutbox(stored[KEYS.quarantine]).length,
        },
        activeTabUrl: tab?.url,
      };
    },

    subscribe(onChange) {
      const listener = (_changes: unknown, area: string) => {
        if (area === "local") onChange();
      };
      chrome.storage.onChanged.addListener(listener);
      return () => chrome.storage.onChanged.removeListener(listener);
    },

    async addSite(input) {
      const reply = await send<{ ok: boolean; error?: string }>({ type: "DOMAINS_ADD", input });
      return reply?.ok ? { ok: true } : { ok: false, error: reply?.error ?? "UNAVAILABLE" };
    },

    async removeSite(domain) {
      const reply = await send<{ ok: boolean; error?: string }>({ type: "DOMAINS_REMOVE", domain });
      return reply?.ok ? { ok: true } : { ok: false, error: reply?.error ?? "UNAVAILABLE" };
    },

    dayStart: localDayStartMs,

    async setTracking(enabled) {
      const reply = await send<PopupTrackingResult>({ type: "TRACKING_SET", enabled });
      return reply?.ok === true && typeof reply.enabled === "boolean"
        ? { ok: true, enabled: reply.enabled }
        : { ok: false, error: "FAILED" };
    },

    async forgetLocalData() {
      return (
        (await send<PopupForgetResult>({ type: "FORGET_LOCAL_DATA" })) ?? {
          ok: false,
          code: "FAILED",
        }
      );
    },

    async disconnect(discardUnsynced) {
      return (
        (await send<PopupDisconnectResult>({ type: "DISCONNECT", discardUnsynced })) ?? {
          ok: false,
          code: "FAILED",
        }
      );
    },

    async refreshSites() {
      await send({ type: "DOMAINS_REFRESH" });
    },

    holdFocus() {
      const connection = chrome.runtime.connect({ name: POPUP_PORT });
      return () => connection.disconnect();
    },

    openDashboard(path = "/dashboard") {
      void chrome.tabs.create({ url: new URL(path, config.dashboardOrigin).toString() });
    },
  };
}
