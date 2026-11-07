import { describe, expect, it, vi } from "vitest";
import { type EngineEnv, INITIAL_ENGINE_STATE } from "../../engine/engine";
import type { IdleState, TabSnapshot } from "../../engine/signals";
import { createLogger } from "../../lib/log";
import { fakeStorage } from "../../test/fakes";
import { DOMAINS_CACHE_KEY, ENGINE_STATE_KEY, OUTBOX_KEY, TRACKING_ENABLED_KEY } from "./keys";
import { createTrackingStore, parseEngineState, parseOutbox } from "./store";
import { createTracker, SLOT_TIMEOUT_MS } from "./tracker";

const T0 = Date.UTC(2026, 10, 9, 13, 0, 0);
const LEETCODE: TabSnapshot = { url: "https://www.leetcode.com/problems/two-sum/", audible: false };
const NEWS: TabSnapshot = { url: "https://news.example/article/1", audible: false };

function setup(initial: Record<string, unknown> = {}) {
  const storage = fakeStorage(initial);
  const store = createTrackingStore(storage);
  const clock = { now: T0 };
  const calls: string[] = [];
  const browser = {
    tab: LEETCODE as TabSnapshot | null,
    idle: "active" as IdleState,
    calls,
    focusedTab: async (): Promise<TabSnapshot | null> => {
      calls.push("tab");
      return browser.tab;
    },
    idleState: async (seconds: number): Promise<IdleState> => {
      calls.push(`idle:${seconds}`);
      return browser.idle;
    },
  };
  let n = 0;
  const env: EngineEnv = {
    deviceId: "00000000-0000-4000-8000-00000000d001",
    newId: () => `00000000-0000-4000-8000-${(++n).toString().padStart(12, "0")}`,
    nextLocalMidnight: (t) => t + 86400 * 10,
  };
  const writes: string[][] = [];
  const set = storage.set.bind(storage);
  storage.set = async (items) => {
    writes.push(Object.keys(items));
    await set(items);
  };
  const tracker = createTracker({
    store,
    browser,
    env: async () => env,
    now: () => clock.now,
    log: createLogger({ debug: false, sink: () => {} }),
    idleThresholdS: 60,
  });
  return { storage, store, clock, browser, tracker, writes };
}

async function connectAndTrack(s: ReturnType<typeof setup>) {
  await s.tracker.dispatch({ type: "START" });
  await s.tracker.dispatch({ type: "AUTH", connected: true });
  await s.tracker.dispatch({ type: "SETTINGS", trackingEnabled: true });
  await s.tracker.dispatch({ type: "DOMAINS", domains: ["leetcode.com"] });
}

describe("tracker (TRK-12, TRK-17)", () => {
  it("TRK-12 answers re-queries in the same slot and persists the open interval", async () => {
    const s = setup();
    await connectAndTrack(s);
    // START asked for tab + idle; DOMAINS asked for the tab again.
    expect(s.browser.calls).toEqual(["tab", "idle:60", "tab"]);
    const state = parseEngineState(s.storage.data.get(ENGINE_STATE_KEY));
    expect(state.open).toMatchObject({ domain: "leetcode.com", startedAt: T0 / 1000 });
  });

  it("TRK-12 review of #15: state and new intervals are stored in one write", async () => {
    const s = setup();
    await connectAndTrack(s);
    s.clock.now = T0 + 120_000;
    s.writes.length = 0;
    await s.tracker.dispatch({ type: "TAB", tab: NEWS });
    expect(s.writes).toEqual([[ENGINE_STATE_KEY, OUTBOX_KEY]]);
    expect(parseOutbox(s.storage.data.get(OUTBOX_KEY))).toHaveLength(1);
    expect(parseEngineState(s.storage.data.get(ENGINE_STATE_KEY)).open).toBeNull();
  });

  it("TRK-17 observations are gathered inside the slot, in arrival order", async () => {
    const s = setup();
    await connectAndTrack(s);
    s.clock.now = T0 + 30_000;
    // A slow query queued first cannot overwrite the newer event queued after it.
    const slow = s.tracker.dispatch(async () => {
      await new Promise((r) => setTimeout(r, 20));
      return { type: "TAB", tab: LEETCODE };
    });
    const newer = s.tracker.dispatch({ type: "TAB", tab: NEWS });
    await Promise.all([slow, newer]);
    expect(parseEngineState(s.storage.data.get(ENGINE_STATE_KEY)).open).toBeNull();
    expect(parseOutbox(s.storage.data.get(OUTBOX_KEY)).map((i) => i.domain)).toEqual([
      "leetcode.com",
    ]);
  });

  it("TRK-12 a failing step is logged without its message and does not stop the queue", async () => {
    const lines: string[] = [];
    const s = setup();
    const tracker = createTracker({
      store: s.store,
      browser: {
        focusedTab: async () => {
          throw new Error("https://secret.example/path");
        },
        idleState: async () => "active",
      },
      env: async () => ({
        deviceId: "00000000-0000-4000-8000-00000000d001",
        newId: () => crypto.randomUUID(),
        nextLocalMidnight: (t) => t + 86400,
      }),
      now: () => T0,
      log: createLogger({ debug: false, sink: (_l, line) => lines.push(line) }),
      idleThresholdS: 60,
    });
    await tracker.dispatch({ type: "START" });
    expect(lines.join("\n")).toContain("tracking.step_failed");
    expect(lines.join("\n")).not.toContain("secret");
    await tracker.dispatch({ type: "AUTH", connected: true });
    expect(parseEngineState(s.storage.data.get(ENGINE_STATE_KEY)).signals.connected).toBe(true);
  });
});

describe("tracker slot timeout", () => {
  it("TRK-17 a hung slot releases the queue after SLOT_TIMEOUT_MS", async () => {
    vi.useFakeTimers();
    try {
      const s = setup();
      const hung = s.tracker.dispatch(() => new Promise(() => {}));
      const next = s.tracker.dispatch({ type: "AUTH", connected: true });
      await vi.advanceTimersByTimeAsync(SLOT_TIMEOUT_MS);
      expect(await hung).toBe(false);
      expect(await next).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("tracker slot timeout: late work", () => {
  it("TRK-17 an observation arriving after its slot timed out is never stored", async () => {
    vi.useFakeTimers();
    try {
      const s = setup();
      let resolveLate: (e: { type: "AUTH"; connected: boolean }) => void = () => {};
      const late = s.tracker.dispatch(() => new Promise((resolve) => (resolveLate = resolve)));
      await vi.advanceTimersByTimeAsync(SLOT_TIMEOUT_MS);
      expect(await late).toBe(false);
      expect(await s.tracker.dispatch({ type: "AUTH", connected: false })).toBe(true);
      // The hung observation finally resolves — with stale data.
      resolveLate({ type: "AUTH", connected: true });
      await vi.advanceTimersByTimeAsync(100);
      expect(parseEngineState(s.storage.data.get(ENGINE_STATE_KEY)).signals.connected).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("tracking store (TRK-12, SEC-02)", () => {
  it("TRK-12 invalid or legacy stored state falls back to the initial state (fails closed)", () => {
    expect(parseEngineState(undefined)).toEqual(INITIAL_ENGINE_STATE);
    expect(parseEngineState({ signals: { connected: true } })).toEqual(INITIAL_ENGINE_STATE);
    // SEC-02: a stored focused "domain" that is really a URL is rejected.
    const leaked = structuredClone(INITIAL_ENGINE_STATE) as unknown as {
      signals: Record<string, unknown>;
    };
    leaked.signals.focusedDomain = "https://x.example/path";
    expect(parseEngineState(leaked)).toEqual(INITIAL_ENGINE_STATE);
  });

  it("TRK-12 fields added later default to null when missing", () => {
    const { notBefore: _n, lastInputAt: _l, ...legacy } = INITIAL_ENGINE_STATE;
    expect(parseEngineState(legacy)).toEqual(INITIAL_ENGINE_STATE);
  });

  it("SYNC-01 corrupted outbox entries are dropped, valid ones kept", () => {
    const valid = {
      id: "00000000-0000-4000-8000-000000000001",
      device_id: "00000000-0000-4000-8000-00000000d001",
      domain: "leetcode.com",
      started_at: "2026-11-09T13:00:00Z",
      ended_at: "2026-11-09T13:10:00Z",
    };
    expect(parseOutbox([valid, { id: "nope" }, "garbage"])).toEqual([valid]);
    expect(parseOutbox("nope")).toEqual([]);
  });

  it("EXT-UI-06 tracking is on unless switched off; the domain list is null until cached", async () => {
    const store = createTrackingStore(fakeStorage());
    expect(await store.trackingEnabled()).toBe(true);
    expect(await store.trackedDomains()).toBeNull();
    const partlyBad = createTrackingStore(
      fakeStorage({ [DOMAINS_CACHE_KEY]: { domains: ["leetcode.com", "https://bad", 3] } }),
    );
    expect(await partlyBad.trackedDomains()).toEqual(["leetcode.com"]); // entries dropped one by one
    const off = createTrackingStore(
      fakeStorage({
        [TRACKING_ENABLED_KEY]: false,
        [DOMAINS_CACHE_KEY]: { domains: ["leetcode.com"] },
      }),
    );
    expect(await off.trackingEnabled()).toBe(false);
    expect(await off.trackedDomains()).toEqual(["leetcode.com"]);
    expect(
      await createTrackingStore(fakeStorage({ [DOMAINS_CACHE_KEY]: "junk" })).trackedDomains(),
    ).toBeNull();
  });

  it("AUTH-12 SEC-14 clear removes engine state, outbox and the user's domain list; the device switch stays", async () => {
    const storage = fakeStorage({
      [ENGINE_STATE_KEY]: {},
      [OUTBOX_KEY]: [],
      [TRACKING_ENABLED_KEY]: false,
      [DOMAINS_CACHE_KEY]: { domains: [] },
    });
    await createTrackingStore(storage).clear();
    expect([...storage.data.keys()]).toEqual([TRACKING_ENABLED_KEY]);
  });

  it("SEC acceptance 2: after a scripted session no stored value contains a path or an untracked host", async () => {
    const s = setup();
    await connectAndTrack(s);
    for (const [i, tab] of [
      LEETCODE,
      NEWS,
      { url: "https://mail.leetcode.com/inbox?id=7", audible: true },
      null,
    ].entries()) {
      s.clock.now = T0 + (i + 1) * 30_000;
      await s.tracker.dispatch({ type: "TAB", tab });
    }
    const dump = JSON.stringify([...s.storage.data.entries()]);
    expect(dump).not.toMatch(/problems|two-sum|news\.example|article|mail\.|inbox|www\./);
  });
});
