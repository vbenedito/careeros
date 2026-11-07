/**
 * Chrome side of tracking (TRK-02, 04, 06, 13, 18, 19): turns Chrome events into engine events.
 * Only `chrome.*` calls live here; everything else is injected so it can be tested with fakes.
 */
import { TRACKING } from "@careeros/shared";
import type { IdleState, TabSnapshot } from "../../engine/signals";
import { POPUP_PORT } from "../../lib/popup-messages";
import type { BrowserPort, Tracker } from "./tracker";

/** TRK-18: a focus loss counts only if it lasts this long. */
export const FOCUS_DEBOUNCE_MS = 500;
export const HEARTBEAT_ALARM = "careeros.heartbeat";
export { POPUP_PORT };

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
  runtime: Pick<typeof chrome.runtime, "onConnect" | "id">;
}

export interface Timers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

/**
 * Reads the active tab of the focused window (TRK-04), honouring the focus-loss debounce
 * (TRK-18). Nothing is cached: URLs of untracked tabs never outlive the call (SEC-02).
 */
export function createChromeBrowserPort(api: ChromeTrackingApi) {
  /** True while a focus loss is waiting for its debounce: the last window still counts. */
  let pendingBlur = false;
  /**
   * True while our popup is open. Chrome reports the window as unfocused then, but the popup is
   * part of Chrome: the user has not left the page they are studying (TRK-04).
   */
  let popupOpen = false;

  const port: BrowserPort & {
    setPendingBlur(value: boolean): void;
    setPopupOpen(value: boolean): void;
    isPopupOpen(): boolean;
    focusedTab(options?: { assumeFocused?: boolean }): Promise<TabSnapshot | null>;
  } = {
    setPendingBlur(value) {
      pendingBlur = value;
    },
    setPopupOpen(value) {
      popupOpen = value;
    },
    isPopupOpen: () => popupOpen,
    async focusedTab(options: { assumeFocused?: boolean } = {}) {
      try {
        const win = await api.windows.getLastFocused({});
        const focused = win.focused || pendingBlur || popupOpen || options.assumeFocused === true;
        if (win.id === undefined || !focused) return null;
        const [tab] = await api.tabs.query({ active: true, windowId: win.id });
        // Incognito is never tracked (SEC-01), even when the extension is allowed there.
        if (!tab || tab.incognito) return null;
        return toTabSnapshot(tab);
      } catch {
        // "No last-focused window" (e.g. macOS with every window closed) means not focused.
        return null;
      }
    },
    async idleState(seconds) {
      try {
        return (await api.idle.queryState(seconds)) as IdleState;
      } catch {
        return "locked"; // fails closed: pauses tracking
      }
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
        if (port.isPopupOpen()) return; // the popup took the focus: still in Chrome
        void tracker.dispatch({ type: "TAB", tab: null });
      }, FOCUS_DEBOUNCE_MS);
      return;
    }
    port.setPendingBlur(false);
    void tabEvent();
  });

  // The popup keeps a port open while shown. Closing it returns to the page, but Chrome sends
  // no focus event for that: re-check right away, trusting the window this once (the next
  // heartbeat confirms with Chrome's own focus flag).
  api.runtime.onConnect.addListener((connection) => {
    if (connection.name !== POPUP_PORT || connection.sender?.id !== api.runtime.id) return;
    port.setPopupOpen(true);
    connection.onDisconnect.addListener(() => {
      port.setPopupOpen(false);
      void tracker.dispatch(async () => ({
        type: "TAB",
        tab: await port.focusedTab({ assumeFocused: true }),
      }));
    });
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
      idle: await port.idleState(TRACKING.IDLE_THRESHOLD_S),
      mediaIdle: await port.idleState(TRACKING.MEDIA_IDLE_CEILING_S),
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
