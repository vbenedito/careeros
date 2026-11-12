import { describe, expect, it } from "vitest";
import type { EngineEvent } from "../../engine/engine";
import { SYNC_STATE_KEY } from "../../lib/sync-state";
import { fakeStorage } from "../../test/fakes";
import { createAccountEpoch } from "../account-epoch";
import { SESSION_STORAGE_KEY } from "../auth/storage";
import { createStorageChangeHandler, createTrackingLocalData, startTracking } from "./bootstrap";
import {
  DEFERRED_KEY,
  DOMAINS_CACHE_KEY,
  ENGINE_STATE_KEY,
  OUTBOX_KEY,
  QUARANTINE_KEY,
  TRACKING_ENABLED_KEY,
} from "./keys";
import { createTrackingStore } from "./store";
import type { EventSource, Tracker } from "./tracker";

function recordingTracker() {
  const events: EngineEvent[] = [];
  const tracker = {
    async dispatch(source: EventSource) {
      events.push(typeof source === "function" ? await source() : source);
      return true;
    },
    exclusive: async <T>(task: () => Promise<T>) => task(),
  } as Tracker;
  return { tracker, events };
}

const interval = {
  id: "00000000-0000-4000-8000-000000000001",
  device_id: "00000000-0000-4000-8000-00000000d001",
  domain: "leetcode.com",
  started_at: "2026-11-09T13:00:00Z",
  ended_at: "2026-11-09T13:10:00Z",
};

describe("tracking bootstrap (TRK-01, TRK-19, AUTH-11/12)", () => {
  it("TRK-01 TRK-19 start sends START, AUTH and SETTINGS always, DOMAINS once cached", async () => {
    const rec = recordingTracker();
    const store = createTrackingStore(
      fakeStorage({ [DOMAINS_CACHE_KEY]: { domains: ["leetcode.com"] } }),
    );
    await startTracking({ tracker: rec.tracker, store, isConnected: async () => true });
    expect(rec.events).toEqual([
      { type: "START" },
      { type: "AUTH", connected: true },
      { type: "SETTINGS", trackingEnabled: true },
      { type: "DOMAINS", domains: ["leetcode.com"] },
    ]);
    const none = recordingTracker();
    await startTracking({
      tracker: none.tracker,
      store: createTrackingStore(fakeStorage()),
      isConnected: async () => false,
    });
    expect(none.events.map((e) => e.type)).toEqual(["START", "AUTH", "SETTINGS"]);
  });

  it("EXT-UI-06 SYNC-09 AUTH-10 storage changes become engine events", async () => {
    const rec = recordingTracker();
    const storage = fakeStorage({
      [TRACKING_ENABLED_KEY]: false,
      [DOMAINS_CACHE_KEY]: { domains: ["neetcode.io"] },
    });
    let connected = true;
    const handle = createStorageChangeHandler({
      tracker: rec.tracker,
      store: createTrackingStore(storage),
      isConnected: async () => connected,
    });
    handle({ [TRACKING_ENABLED_KEY]: { newValue: false } }, "local");
    handle({ [DOMAINS_CACHE_KEY]: { newValue: {} } }, "local");
    handle({ [SESSION_STORAGE_KEY]: { newValue: "{}" } }, "local");
    await new Promise((r) => setTimeout(r, 0));
    connected = false;
    handle({ [SESSION_STORAGE_KEY]: { oldValue: "{}" } }, "local");
    handle({ [TRACKING_ENABLED_KEY]: { newValue: true } }, "sync");
    await new Promise((r) => setTimeout(r, 0));
    // Lazy sources resolve asynchronously; the real queue keeps arrival order (queue.test.ts).
    expect(rec.events).toHaveLength(4);
    expect(rec.events).toEqual(
      expect.arrayContaining([
        { type: "SETTINGS", trackingEnabled: false },
        { type: "DOMAINS", domains: ["neetcode.io"] },
        { type: "AUTH", connected: true },
        { type: "AUTH", connected: false },
      ]),
    );
  });

  it("AUTH-12 pending data is the outbox; stop/resume go through the engine", async () => {
    const rec = recordingTracker();
    const storage = fakeStorage({ [OUTBOX_KEY]: [interval] });
    const store = createTrackingStore(storage);
    const ld = createTrackingLocalData({
      tracker: rec.tracker,
      store,
      isConnected: async () => true,
    });
    expect(await ld.pendingCount()).toBe(1);
    expect(await ld.flush(async () => null)).toBe(1); // nothing uploaded: still pending
    await ld.stopTracking();
    // While stopped, nothing (e.g. the worker's own start sequence) reports "connected".
    expect(await ld.isConnected()).toBe(false);
    await ld.resumeTracking();
    expect(await ld.isConnected()).toBe(true);
    expect(rec.events).toEqual([
      { type: "AUTH", connected: false },
      { type: "AUTH", connected: true },
    ]);
  });

  it("AUTH-12 flush runs the final upload with the given token provider, then counts", async () => {
    const rec = recordingTracker();
    const storage = fakeStorage({ [OUTBOX_KEY]: [interval] });
    const tokens: (string | null)[] = [];
    const ld = createTrackingLocalData({
      tracker: rec.tracker,
      store: createTrackingStore(storage),
      isConnected: async () => true,
      upload: async (accessToken) => {
        tokens.push(await accessToken());
        storage.data.set(OUTBOX_KEY, []);
      },
    });
    expect(await ld.flush(async () => "t")).toBe(0);
    expect(tokens).toEqual(["t"]);
  });

  it("AUTH-12 stopTracking fails loudly when the open interval could not be closed", async () => {
    const tracker = {
      dispatch: async () => false,
      exclusive: async <T>(t: () => Promise<T>) => t(),
    } as unknown as Tracker;
    const ld = createTrackingLocalData({
      tracker,
      store: createTrackingStore(fakeStorage()),
      isConnected: async () => true,
    });
    await expect(ld.stopTracking()).rejects.toThrow();
  });

  it("AUTH-11 clear removes local tracking data and replays the start sequence", async () => {
    const rec = recordingTracker();
    const storage = fakeStorage({
      [OUTBOX_KEY]: [interval],
      [ENGINE_STATE_KEY]: {},
      [DOMAINS_CACHE_KEY]: { domains: ["leetcode.com"] },
      [SYNC_STATE_KEY]: { failures: 2, notBefore: 1, lastOutcome: "offline" },
    });
    const epoch = createAccountEpoch();
    const store = createTrackingStore(storage, epoch);
    const order: string[] = [];
    let inQueue = false;
    rec.tracker.exclusive = async <T>(task: () => Promise<T>) => {
      inQueue = true;
      try {
        return await task();
      } finally {
        inQueue = false;
      }
    };
    await createTrackingLocalData({
      tracker: rec.tracker,
      store,
      isConnected: async () => false,
      forgetDevice: async () => {
        order.push(`forget-device:in-queue=${inQueue}`);
      },
    }).clear();
    // #113: a new device id and no sync status of the previous account; in-flight work is stale.
    expect(order).toEqual(["forget-device:in-queue=true"]);
    expect(storage.data.has(SYNC_STATE_KEY)).toBe(false);
    expect(epoch.current()).toBe(1);
    expect(storage.data.has(OUTBOX_KEY)).toBe(false);
    expect(storage.data.has(ENGINE_STATE_KEY)).toBe(false);
    expect(storage.data.has(DOMAINS_CACHE_KEY)).toBe(false); // the list belongs to the user
    expect(rec.events.map((e) => e.type)).toEqual(["START", "AUTH", "SETTINGS"]);
  });
});

describe("local counts for Disconnect (#65, SYNC-05a)", () => {
  it("AUTH-11 AUTH-12 deferred intervals are unsynced too; quarantined ones are counted apart", async () => {
    const rec = recordingTracker();
    const storage = fakeStorage({
      [OUTBOX_KEY]: [interval],
      [DEFERRED_KEY]: [
        {
          interval: { ...interval, id: "00000000-0000-4000-8000-0000000000d2" },
          retryAt: 1,
          attempts: 1,
        },
      ],
      [QUARANTINE_KEY]: [{ ...interval, id: "00000000-0000-4000-8000-0000000000d3" }],
    });
    let waited = 0;
    const ld = createTrackingLocalData({
      tracker: rec.tracker,
      store: createTrackingStore(storage),
      isConnected: async () => true,
      waitForUpload: async () => {
        waited++;
        return false;
      },
    });
    expect(await ld.pendingCount()).toBe(2);
    expect(await ld.quarantinedCount?.()).toBe(1);
    expect(await ld.waitForUpload?.()).toBe(false);
    expect(waited).toBe(1);
  });
});
