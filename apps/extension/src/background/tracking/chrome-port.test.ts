import { describe, expect, it, vi } from "vitest";
import type { EngineEvent } from "../../engine/engine";
import {
  type ChromeTrackingApi,
  createChromeBrowserPort,
  FOCUS_DEBOUNCE_MS,
  HEARTBEAT_ALARM,
  registerTrackingListeners,
  setUpChromeTracking,
  toTabSnapshot,
} from "./chrome-port";
import type { EventSource, Tracker } from "./tracker";

/** Minimal chrome.events.Event fake. */
function event<A extends unknown[]>() {
  const listeners: ((...args: A) => void)[] = [];
  return {
    addListener: (fn: (...args: A) => void) => listeners.push(fn),
    emit: (...args: A) => {
      for (const fn of listeners) fn(...args);
    },
  };
}

const NONE = -1;

function fakeChrome() {
  const state = {
    window: { id: 1 as number | undefined, focused: true },
    tab: { url: "https://leetcode.com/problems/x", audible: false, mutedInfo: { muted: false } } as
      | chrome.tabs.Tab
      | undefined,
    idle: { 60: "active", 900: "active" } as Record<number, string>,
    alarms: new Map<string, unknown>(),
    detection: 0,
  };
  const ev = {
    activated: event<[chrome.tabs.OnActivatedInfo]>(),
    updated: event<[number, chrome.tabs.OnUpdatedInfo, chrome.tabs.Tab]>(),
    focus: event<[number]>(),
    idle: event<[string]>(),
    alarm: event<[chrome.alarms.Alarm]>(),
  };
  const api = {
    tabs: {
      query: async () => (state.tab ? [state.tab] : []),
      onActivated: ev.activated,
      onUpdated: ev.updated,
    },
    windows: {
      getLastFocused: async () => state.window,
      onFocusChanged: ev.focus,
      WINDOW_ID_NONE: NONE,
    },
    idle: {
      queryState: async (s: number) => state.idle[s] ?? "active",
      setDetectionInterval: (s: number) => {
        state.detection = s;
      },
      onStateChanged: ev.idle,
    },
    alarms: {
      create: async (name: string, info: unknown) => {
        state.alarms.set(name, info);
      },
      get: async (name: string) => state.alarms.get(name),
      onAlarm: ev.alarm,
    },
  } as unknown as ChromeTrackingApi;
  return { api, state, ev };
}

/** Records the events the listeners produce (resolving lazy sources like the queue would). */
function recordingTracker() {
  const events: EngineEvent[] = [];
  const pending: Promise<void>[] = [];
  const tracker = {
    dispatch(source: EventSource) {
      const p = (async () => {
        events.push(typeof source === "function" ? await source() : source);
      })();
      pending.push(p);
      return p;
    },
    exclusive: async <T>(task: () => Promise<T>) => task(),
  } as Tracker;
  return { tracker, events, settle: () => Promise.all(pending) };
}

function setup() {
  const chrome = fakeChrome();
  const port = createChromeBrowserPort(chrome.api);
  const rec = recordingTracker();
  registerTrackingListeners({ api: chrome.api, port, tracker: rec.tracker, timers: globalThis });
  return { ...chrome, port, ...rec };
}

const leetcodeTab = {
  type: "TAB",
  tab: { url: "https://leetcode.com/problems/x", audible: false },
};

describe("Chrome adapter (TRK-02, 04, 06, 13, 18, 19)", () => {
  it("TRK-06 muted tabs are not audible", () => {
    expect(toTabSnapshot({ url: "u", audible: true, mutedInfo: { muted: true } })).toEqual({
      url: "u",
      audible: false,
    });
    expect(toTabSnapshot({ url: "u", audible: true, mutedInfo: { muted: false } })).toEqual({
      url: "u",
      audible: true,
    });
    expect(toTabSnapshot({ url: "u" })).toEqual({ url: "u", audible: false });
  });

  it("TRK-04 the active tab of the focused window, or null when no Chrome window is focused", async () => {
    const s = setup();
    expect(await s.port.focusedTab()).toEqual(leetcodeTab.tab);
    s.state.window = { id: 1, focused: false };
    expect(await s.port.focusedTab()).toBeNull();
    s.state.window = { id: 1, focused: true };
    s.state.tab = undefined;
    expect(await s.port.focusedTab()).toBeNull();
  });

  it("TRK-04 tab activation and relevant tab updates produce TAB events from a fresh query", async () => {
    const s = setup();
    s.ev.activated.emit({ tabId: 1, windowId: 1 });
    s.ev.updated.emit(1, { title: "ignored" }, { active: true } as chrome.tabs.Tab);
    s.ev.updated.emit(1, { url: "https://x" }, { active: false } as chrome.tabs.Tab);
    s.ev.updated.emit(1, { audible: true }, { active: true } as chrome.tabs.Tab);
    s.ev.updated.emit(1, { mutedInfo: { muted: true } }, { active: true } as chrome.tabs.Tab);
    await s.settle();
    expect(s.events).toEqual([leetcodeTab, leetcodeTab, leetcodeTab]);
  });

  it("TRK-18 a focus loss is confirmed only after the debounce", async () => {
    vi.useFakeTimers();
    try {
      const s = setup();
      s.ev.focus.emit(NONE);
      await vi.advanceTimersByTimeAsync(FOCUS_DEBOUNCE_MS - 1);
      expect(s.events).toEqual([]);
      await vi.advanceTimersByTimeAsync(1);
      await s.settle();
      expect(s.events).toEqual([{ type: "TAB", tab: null }]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("TRK-18 switching between Chrome windows (NONE then a window) does not split", async () => {
    vi.useFakeTimers();
    try {
      const s = setup();
      s.ev.focus.emit(NONE);
      s.ev.focus.emit(2);
      await vi.advanceTimersByTimeAsync(FOCUS_DEBOUNCE_MS * 2);
      await s.settle();
      expect(s.events).toEqual([leetcodeTab]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("TRK-18 a heartbeat during the debounce uses the last tab, not a fresh unfocused read", async () => {
    vi.useFakeTimers();
    try {
      const s = setup();
      await s.port.focusedTab(); // last snapshot: leetcode
      s.ev.focus.emit(NONE);
      s.state.window = { id: 1, focused: false };
      s.ev.alarm.emit({ name: HEARTBEAT_ALARM } as chrome.alarms.Alarm);
      await s.settle();
      expect(s.events[0]).toMatchObject({ type: "HEARTBEAT", tab: leetcodeTab.tab });
    } finally {
      vi.useRealTimers();
    }
  });

  it("TRK-05 TRK-13 idle changes and heartbeats carry the idle and 15-minute media states", async () => {
    const s = setup();
    s.ev.idle.emit("idle");
    s.state.idle = { 60: "idle", 900: "active" };
    s.ev.alarm.emit({ name: HEARTBEAT_ALARM } as chrome.alarms.Alarm);
    s.ev.alarm.emit({ name: "other" } as chrome.alarms.Alarm);
    await s.settle();
    expect(s.events).toEqual([
      { type: "IDLE", state: "idle" },
      { type: "HEARTBEAT", tab: leetcodeTab.tab, idle: "idle", mediaIdle: "active" },
    ]);
  });

  it("TRK-13 TRK-19 worker start sets the idle detection interval and creates the heartbeat once", async () => {
    const s = fakeChrome();
    await setUpChromeTracking(s.api);
    await setUpChromeTracking(s.api);
    expect(s.state.detection).toBe(60);
    expect([...s.state.alarms.entries()]).toEqual([[HEARTBEAT_ALARM, { periodInMinutes: 1 }]]);
  });
});
