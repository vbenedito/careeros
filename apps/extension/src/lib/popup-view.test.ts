import type { Interval } from "@careeros/shared";
import { describe, expect, it } from "vitest";
import { type EngineState, INITIAL_ENGINE_STATE } from "../engine/engine";
import { buildPopupView, type PopupInput } from "./popup-view";
import { INITIAL_SYNC_STATE, isSyncing, parseSyncState, SYNCING_STALE_MS } from "./sync-state";

const TODAY = Date.UTC(2026, 10, 9, 3, 0, 0); // local midnight in UTC−3
const NOW = TODAY + 10 * 3600_000; // 10:00 local
const iso = (t: number) => `${new Date(t).toISOString().slice(0, 19)}Z`;
let n = 0;
const iv = (domain: string, from: number, minutes: number): Interval => ({
  id: `00000000-0000-4000-8000-${(++n).toString().padStart(12, "0")}`,
  device_id: "00000000-0000-4000-8000-00000000d001",
  domain,
  started_at: iso(from),
  ended_at: iso(from + minutes * 60_000),
});
const open = (domain: string, fromMs: number): EngineState => ({
  ...INITIAL_ENGINE_STATE,
  open: { id: "00000000-0000-4000-8000-0000000000ff", domain, startedAt: fromMs / 1000 },
});

function input(over: Partial<PopupInput> = {}): PopupInput {
  return {
    now: NOW,
    startOfToday: TODAY,
    auth: { connected: true, email: "a@example.test" },
    trackingEnabled: true,
    trackedDomains: ["leetcode.com", "neetcode.io"],
    engine: INITIAL_ENGINE_STATE,
    todayIntervals: [],
    sync: { ...INITIAL_SYNC_STATE, lastSyncedAt: NOW - 120_000, lastOutcome: "ok" },
    counts: { pending: 0, quarantined: 0 },
    activeTabUrl: "https://www.leetcode.com/problems/x",
    ...over,
  };
}

describe("popup view (EXT-UI-01..05, SYNC-12)", () => {
  it("SYNC-12 today = closed intervals of today + the open interval; top 3 with a shared scale", () => {
    const view = buildPopupView(
      input({
        todayIntervals: [
          iv("leetcode.com", TODAY + 3600_000, 30),
          iv("neetcode.io", TODAY + 2 * 3600_000, 20),
          iv("docs.python.org", TODAY + 3 * 3600_000, 5),
          iv("example.org", TODAY + 4 * 3600_000, 1),
        ],
        engine: open("leetcode.com", NOW - 10 * 60_000),
      }),
    );
    expect(view.todaySeconds).toBe((30 + 20 + 5 + 1 + 10) * 60);
    expect(view.top.map((d) => [d.domain, d.seconds])).toEqual([
      ["leetcode.com", 40 * 60],
      ["neetcode.io", 20 * 60],
      ["docs.python.org", 5 * 60],
    ]);
    expect(view.top[0]?.share).toBeCloseTo(40 / 66);
  });

  it("SYNC-12 an interval open since yesterday only counts from midnight", () => {
    const view = buildPopupView(
      input({ engine: open("leetcode.com", TODAY - 600_000), now: TODAY + 300_000 }),
    );
    expect(view.todaySeconds).toBe(300);
  });

  it("EXT-UI current session spans the 30-minute splits of the same run", () => {
    const first = iv("leetcode.com", NOW - 40 * 60_000, 30);
    const view = buildPopupView(
      input({ todayIntervals: [first], engine: open("leetcode.com", NOW - 10 * 60_000) }),
    );
    expect(view.current).toEqual({ domain: "leetcode.com", seconds: 40 * 60 });
  });

  it("status: tracking, idle, untracked (with the normalized host to add), no sites, disabled, disconnected", () => {
    expect(buildPopupView(input({ engine: open("leetcode.com", NOW - 60_000) })).status).toEqual({
      kind: "tracking",
      domain: "leetcode.com",
    });
    expect(buildPopupView(input()).status).toEqual({ kind: "idle", domain: "leetcode.com" });
    expect(buildPopupView(input({ activeTabUrl: "https://www.Example.com/a?b" })).status).toEqual({
      kind: "untracked",
      addHost: "example.com",
    });
    expect(buildPopupView(input({ activeTabUrl: "chrome://extensions" })).status).toEqual({
      kind: "untracked",
      addHost: null,
    });
    expect(buildPopupView(input({ trackedDomains: [] })).status).toEqual({
      kind: "no-sites",
      addHost: "leetcode.com",
    });
    expect(buildPopupView(input({ trackedDomains: null })).status).toEqual({
      kind: "loading-sites",
    });
    expect(buildPopupView(input({ trackingEnabled: false })).status).toEqual({ kind: "disabled" });
    expect(buildPopupView(input({ auth: { connected: false, email: null } })).status).toEqual({
      kind: "disconnected",
    });
  });

  it("sync footer states", () => {
    const label = (over: Partial<PopupInput>) => buildPopupView(input(over)).syncLabel;
    expect(label({})).toBe("Synced · 2m ago");
    expect(label({ sync: INITIAL_SYNC_STATE })).toBe("Not synced yet");
    expect(
      label({
        counts: { pending: 3, quarantined: 0 },
        sync: { ...INITIAL_SYNC_STATE, lastOutcome: "offline", notBefore: NOW + 4 * 60_000 },
      }),
    ).toBe("3 pending · retrying in 4m");
    expect(
      label({
        counts: { pending: 3, quarantined: 0 },
        sync: { ...INITIAL_SYNC_STATE, lastOutcome: "offline", notBefore: NOW - 1 },
      }),
    ).toBe("Offline · 3 pending");
    expect(
      label({
        counts: { pending: 2, quarantined: 0 },
        sync: { ...INITIAL_SYNC_STATE, lastOutcome: "error" },
      }),
    ).toBe("Sync error · 2 pending");
    expect(buildPopupView(input({ counts: { pending: 0, quarantined: 2 } })).quarantined).toBe(2);
  });
});

describe("popup state for sync hardening (#58, #83)", () => {
  it("SYNC-02c syncing while a recent cycle mark is set; a stale mark (killed worker) is ignored", () => {
    expect(
      buildPopupView(input({ sync: { ...INITIAL_SYNC_STATE, syncingSince: NOW - 2000 } })).syncing,
    ).toBe(true);
    expect(
      buildPopupView(input({ sync: { ...INITIAL_SYNC_STATE, syncingSince: NOW - 10 * 60_000 } }))
        .syncing,
    ).toBe(false);
    expect(buildPopupView(input()).syncing).toBe(false);
    expect(
      buildPopupView(
        input({
          auth: { connected: false, email: null },
          sync: { ...INITIAL_SYNC_STATE, syncingSince: NOW },
        }),
      ).syncing,
    ).toBe(false);
  });

  it("SYNC-05a the clock hint gives whole minutes ahead; deferred intervals are counted", () => {
    const view = buildPopupView(
      input({
        sync: { ...INITIAL_SYNC_STATE, clockAheadMs: 19.6 * 60_000 },
        counts: { pending: 3, quarantined: 0, deferred: 2 },
      }),
    );
    expect(view.clockAheadMinutes).toBe(20);
    expect(view.deferred).toBe(2);
    expect(view.syncLabel).toBe("3 pending");
    expect(buildPopupView(input()).clockAheadMinutes).toBeNull();
  });
});

describe("isSyncing (SYNC-02c)", () => {
  it("is false without a mark and after SYNCING_STALE_MS", () => {
    expect(isSyncing(INITIAL_SYNC_STATE, NOW)).toBe(false);
    expect(isSyncing({ ...INITIAL_SYNC_STATE, syncingSince: NOW }, NOW + SYNCING_STALE_MS)).toBe(
      false,
    );
    expect(isSyncing({ ...INITIAL_SYNC_STATE, syncingSince: NOW }, NOW + 1000)).toBe(true);
  });

  it("an old stored state without the new fields parses with defaults", () => {
    expect(
      parseSyncState({ failures: 2, notBefore: 5, lastOutcome: "offline", lastSyncedAt: null }),
    ).toEqual({
      ...INITIAL_SYNC_STATE,
      failures: 2,
      notBefore: 5,
      lastOutcome: "offline",
    });
  });
});
