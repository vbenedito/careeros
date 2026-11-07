/**
 * Everything the popup reads and does, behind one interface so components can be tested with
 * fixtures. Reads come from chrome.storage; commands go to the worker (EXT-UI-05a).
 */
import { parseEngineState, parseOutbox } from "../background/tracking/store";
import { config } from "../lib/config";
import type { PopupAuthStatus, PopupRequest } from "../lib/popup-messages";
import type { PopupInput } from "../lib/popup-view";
import { parseSyncState, SYNC_STATE_KEY } from "../lib/sync-state";

// Same keys the worker writes (background/tracking/keys.ts); read-only here.
const KEYS = {
  engine: "careeros.tracking.engine",
  outbox: "careeros.tracking.outbox",
  quarantine: "careeros.tracking.quarantine",
  syncedToday: "careeros.tracking.syncedToday",
  trackingEnabled: "careeros.settings.trackingEnabled",
  domains: "careeros.domains.cache",
} as const;

export type CommandResult = { ok: true } | { ok: false; error: string };

export interface PopupData {
  /** Everything except `now`, which the view adds every second. */
  load(): Promise<Omit<PopupInput, "now">>;
  /** Calls back whenever the worker changes what the popup shows. */
  subscribe(onChange: () => void): () => void;
  addSite(input: string): Promise<CommandResult>;
  refreshSites(): Promise<void>;
  openDashboard(path?: string): void;
  version: string;
}

function startOfToday(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
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
      const today = startOfToday(Date.now());
      const outbox = parseOutbox(stored[KEYS.outbox]);
      const synced = parseOutbox(stored[KEYS.syncedToday]);
      const domains = stored[KEYS.domains] as { domains?: unknown } | undefined;
      return {
        startOfToday: today,
        auth: { connected: auth?.connected ?? false, email: auth?.email ?? null },
        trackingEnabled: stored[KEYS.trackingEnabled] !== false,
        trackedDomains: Array.isArray(domains?.domains) ? (domains.domains as string[]) : null,
        engine: parseEngineState(stored[KEYS.engine]),
        todayIntervals: [...synced, ...outbox].filter((i) => Date.parse(i.started_at) >= today),
        sync: parseSyncState(stored[SYNC_STATE_KEY]),
        counts: {
          pending: outbox.length,
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

    async refreshSites() {
      await send({ type: "DOMAINS_REFRESH" });
    },

    openDashboard(path = "/") {
      void chrome.tabs.create({ url: new URL(path, config.dashboardOrigin).toString() });
    },
  };
}
