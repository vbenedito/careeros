/**
 * Chrome side of tracking (TRK-02, 04, 06, 13, 18, 19): turns Chrome events into engine events.
 * Only `chrome.*` calls live here; everything else is injected so it can be tested with fakes.
 */
import { TRACKING } from "@careeros/shared";
import type { IdleState, TabSnapshot } from "../../engine/signals";
import type { BrowserPort, Tracker } from "./tracker";

/** TRK-18: a focus loss counts only if it lasts this long. */
export const FOCUS_DEBOUNCE_MS = 500;
export const HEARTBEAT_ALARM = "careeros.heartbeat";

/** TRK-06: Chrome reports muted tabs as audible; they do not count. */
export function toTabSnapshot(
  tab: Pick<chrome.tabs.Tab, "url" | "audible" | "mutedInfo">,
): TabSnapshot {
  return { url: tab.url, audible: tab.audible === true && tab.mutedInfo?.muted !== true };
}

/** The subset of the Chrome API used for tracking (tests pass a fake). */
export interface ChromeTrackingApi {
  tabs: Pick<typeof chrome.tabs, "query" | "onActivated" | "onUpdated">;
  windows: Pick<typeof chrome.windows, "getLastFocused" | "onFocusChanged" | "WINDOW_ID_NONE">;
  idle: Pick<typeof chrome.idle, "queryState" | "setDetectionInterval" | "onStateChanged">;
  alarms: Pick<typeof chrome.alarms, "create" | "get" | "onAlarm">;
}

export interface Timers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

/** Reads the active tab of the focused window, honouring the focus-loss debounce (TRK-18). */
export function createChromeBrowserPort(api: ChromeTrackingApi) {
  /** True while a focus loss is waiting for its debounce: still treated as focused. */
  let pendingBlur = false;
  let lastSnapshot: TabSnapshot | null = null;

  const port: BrowserPort & { setPendingBlur(value: boolean): void } = {
    setPendingBlur(value) {
      pendingBlur = value;
    },
    async focusedTab() {
      if (pendingBlur) return lastSnapshot;
      const win = await api.windows.getLastFocused({});
      let snapshot: TabSnapshot | null = null;
      if (win.focused && win.id !== undefined) {
        const [tab] = await api.tabs.query({ active: true, windowId: win.id });
        snapshot = tab ? toTabSnapshot(tab) : null;
      }
      lastSnapshot = snapshot;
      return snapshot;
    },
    async idleState(seconds) {
      return (await api.idle.queryState(seconds)) as IdleState;
    },
  };
  return port;
}

export type ChromeBrowserPort = ReturnType<typeof createChromeBrowserPort>;

/**
 * Registers the tracking listeners. Must be called synchronously at worker start so Chrome
 * events can wake the worker (MV3).
 */
export function registerTrackingListeners(deps: {
  api: ChromeTrackingApi;
  port: ChromeBrowserPort;
  tracker: Tracker;
  timers: Timers;
}) {
  const { api, port, tracker, timers } = deps;
  const tabEvent = () =>
    tracker.dispatch(async () => ({ type: "TAB", tab: await port.focusedTab() }));
  let blurTimer: unknown = null;

  api.tabs.onActivated.addListener(() => void tabEvent());
  api.tabs.onUpdated.addListener((_id, change, tab) => {
    // Only changes that can alter eligibility of the active tab: URL, audio, mute.
    if (!tab.active) return;
    if (change.url === undefined && change.audible === undefined && change.mutedInfo === undefined)
      return;
    void tabEvent();
  });

  api.windows.onFocusChanged.addListener((windowId) => {
    if (blurTimer !== null) {
      timers.clearTimeout(blurTimer);
      blurTimer = null;
    }
    if (windowId === api.windows.WINDOW_ID_NONE) {
      // TRK-18: confirm the loss after the debounce; meanwhile the last tab still counts.
      port.setPendingBlur(true);
      blurTimer = timers.setTimeout(() => {
        blurTimer = null;
        port.setPendingBlur(false);
        void tracker.dispatch({ type: "TAB", tab: null });
      }, FOCUS_DEBOUNCE_MS);
      return;
    }
    port.setPendingBlur(false);
    void tabEvent();
  });

  api.idle.onStateChanged.addListener((state) => {
    void tracker.dispatch({ type: "IDLE", state: state as IdleState });
  });

  api.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== HEARTBEAT_ALARM) return;
    // TRK-13: all observations are gathered inside the queue slot.
    void tracker.dispatch(async () => ({
      type: "HEARTBEAT",
      tab: await port.focusedTab(),
      idle: (await api.idle.queryState(TRACKING.IDLE_THRESHOLD_S)) as IdleState,
      mediaIdle: (await api.idle.queryState(TRACKING.MEDIA_IDLE_CEILING_S)) as IdleState,
    }));
  });
}

/** TRK-13/19: per worker start — idle detection interval and the heartbeat alarm. */
export async function setUpChromeTracking(api: ChromeTrackingApi): Promise<void> {
  api.idle.setDetectionInterval(TRACKING.IDLE_THRESHOLD_S);
  if (!(await api.alarms.get(HEARTBEAT_ALARM))) {
    await api.alarms.create(HEARTBEAT_ALARM, { periodInMinutes: TRACKING.HEARTBEAT_PERIOD_MIN });
  }
}
