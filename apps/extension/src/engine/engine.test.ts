/**
 * Engine B with a fake clock (TRK-08..15, acceptance criteria 1–7 of specs/v0/01-tracking.md).
 * Time is in seconds from T0; local time zone is UTC−3 (America/Sao_Paulo has no DST).
 */
import { IntervalSchema, TRACKING } from "@careeros/shared";
import { describe, expect, it } from "vitest";
import {
  type EngineEffect,
  type EngineEnv,
  type EngineEvent,
  type EngineState,
  GAP_S,
  INITIAL_ENGINE_STATE,
  localMidnightAfter,
  step,
} from "./engine";
import type { IdleState, TabSnapshot } from "./signals";

const T0 = Date.UTC(2026, 10, 9, 13, 0, 0) / 1000; // Mon 2026-11-09 10:00 local
const OFFSET_S = 3 * 3600; // UTC−3

const tab = (url: string, audible = false): TabSnapshot => ({ url, audible });
const LEETCODE = tab("https://www.leetcode.com/problems/two-sum/?tab=description");
const NEWS = tab("https://news.example/today");

function makeEnv(): EngineEnv {
  let n = 0;
  return {
    deviceId: "00000000-0000-4000-8000-00000000d001",
    newId: () => `00000000-0000-4000-8000-${(++n).toString().padStart(12, "0")}`,
    nextLocalMidnight: (t) => (Math.floor((t - OFFSET_S) / 86400) + 1) * 86400 + OFFSET_S,
  };
}

/** Drives the engine like the adapter would: one event at a time, at a given second. */
class Sim {
  state: EngineState = INITIAL_ENGINE_STATE;
  effects: EngineEffect[] = [];
  private readonly env = makeEnv();

  send(at: number, event: EngineEvent, ms = 0) {
    const r = step(this.state, event, (T0 + at) * 1000 + ms, this.env);
    this.state = r.state;
    this.effects.push(...r.effects);
    return r;
  }

  /** Heartbeats every minute in (from, to], with the given observations. */
  heartbeats(
    from: number,
    to: number,
    tab: TabSnapshot | null,
    idle: IdleState,
    mediaIdle: (t: number) => IdleState = () => "active",
  ) {
    for (let t = from + 60; t <= to; t += 60) {
      this.send(t, { type: "HEARTBEAT", tab, idle, mediaIdle: mediaIdle(t) });
    }
  }

  /** Emitted intervals as [domain, start, end] in seconds from T0. */
  intervals(): [string, number, number][] {
    return this.effects.flatMap((e) =>
      e.type === "EMIT_INTERVAL"
        ? [
            [
              e.interval.domain,
              Date.parse(e.interval.started_at) / 1000 - T0,
              Date.parse(e.interval.ended_at) / 1000 - T0,
            ] as [string, number, number],
          ]
        : [],
    );
  }

  emitted() {
    return this.effects.flatMap((e) => (e.type === "EMIT_INTERVAL" ? [e.interval] : []));
  }
}

/** Connected, enabled, domains loaded, active user on leetcode at t=0. */
function studying(audible = false): Sim {
  const sim = new Sim();
  sim.send(0, { type: "START" });
  sim.send(0, { type: "AUTH", connected: true });
  sim.send(0, { type: "SETTINGS", trackingEnabled: true });
  sim.send(0, { type: "DOMAINS", domains: ["leetcode.com", "neetcode.io"] });
  sim.send(0, { type: "IDLE", state: "active" });
  sim.send(0, { type: "TAB", tab: { ...LEETCODE, audible } });
  return sim;
}

describe("Engine B — acceptance (specs/v0/01-tracking.md §4)", () => {
  it("AC1 TRK-08 TRK-10 10 minutes on www.leetcode.com/problems/x record ~600 s under leetcode.com, no path stored", () => {
    const sim = studying();
    sim.heartbeats(0, 600, LEETCODE, "active");
    sim.send(600, { type: "TAB", tab: NEWS });
    expect(sim.intervals()).toEqual([["leetcode.com", 0, 600]]);
    const everything = JSON.stringify([sim.state, sim.effects]);
    expect(everything).not.toMatch(/problems|two-sum|tab=|www\.|news\.example/);
    for (const i of sim.emitted()) expect(IntervalSchema.safeParse(i).success).toBe(true);
  });

  it("AC2 TRK-05 no input for 3 minutes (no media): the interval ends 60 s after the last input", () => {
    const sim = studying();
    sim.heartbeats(0, 240, LEETCODE, "active"); // last input at 240
    sim.send(300, { type: "IDLE", state: "idle" }); // detection at last input + 60
    sim.heartbeats(300, 420, LEETCODE, "idle");
    expect(sim.intervals()).toEqual([["leetcode.com", 0, 300]]);
    expect(sim.state.open).toBeNull();
    expect(sim.state.lastInputAt).toBe(T0 + 240);
  });

  it("AC3 TRK-06 an audible lecture with no input is tracked until the 15-minute ceiling, then resumes on input", () => {
    const sim = studying(true);
    const audibleTab = { ...LEETCODE, audible: true };
    sim.send(60, { type: "IDLE", state: "idle" }); // last input at 0
    // The 15-minute query turns idle once 900 s have passed without input.
    sim.heartbeats(60, 1500, audibleTab, "idle", (t) => (t >= 900 ? "idle" : "active"));
    expect(sim.intervals()).toEqual([["leetcode.com", 0, 900]]);
    sim.send(1500, { type: "IDLE", state: "active" });
    sim.send(1600, { type: "TAB", tab: NEWS });
    expect(sim.intervals()).toEqual([
      ["leetcode.com", 0, 900],
      ["leetcode.com", 1500, 1600],
    ]);
  });

  it("AC4 TRK-04 TRK-08 switching tab, window or minimizing closes the interval at the event", () => {
    const toUntracked = studying();
    toUntracked.send(120, { type: "TAB", tab: NEWS }, 400);
    expect(toUntracked.intervals()).toEqual([["leetcode.com", 0, 120]]);

    const blurred = studying(); // focus loss is reported as TAB null (debounced in the adapter)
    blurred.send(90, { type: "TAB", tab: null });
    expect(blurred.intervals()).toEqual([["leetcode.com", 0, 90]]);

    const otherDomain = studying();
    otherDomain.send(100, { type: "TAB", tab: tab("https://neetcode.io/roadmap") });
    otherDomain.send(200, { type: "TAB", tab: NEWS });
    expect(otherDomain.intervals()).toEqual([
      ["leetcode.com", 0, 100],
      ["neetcode.io", 100, 200],
    ]);
  });

  it("AC5 TRK-12 TRK-19 a worker restart mid-interval loses no time and does not split it", () => {
    const sim = studying();
    sim.heartbeats(0, 120, LEETCODE, "active");
    const r = sim.send(150, { type: "START" }); // worker killed and woken by Chrome
    expect(r.effects).toEqual([{ type: "REQUERY_TAB" }, { type: "REQUERY_IDLE" }]);
    sim.send(150, { type: "TAB", tab: LEETCODE });
    sim.send(150, { type: "IDLE", state: "active" });
    sim.heartbeats(150, 330, LEETCODE, "active");
    sim.send(330, { type: "TAB", tab: NEWS });
    expect(sim.intervals()).toEqual([["leetcode.com", 0, 330]]);
  });

  it("AC5 TRK-14 a browser crash loses at most one heartbeat period", () => {
    const sim = studying();
    sim.heartbeats(0, 300, LEETCODE, "active"); // last heartbeat at 300, crash at ~350
    const r = sim.send(3600, { type: "START" }); // browser reopened an hour later
    expect(sim.intervals()).toEqual([["leetcode.com", 0, 300]]);
    expect(r.effects).toContainEqual({ type: "REQUERY_TAB" });
    expect(r.effects).toContainEqual({ type: "REQUERY_IDLE" });
    expect(sim.state.open).toBeNull();
  });

  it("AC6 TRK-08 TRK-09a a 50-minute run produces 30 + 20 minute intervals", () => {
    const sim = studying();
    sim.heartbeats(0, 3000, LEETCODE, "active");
    sim.send(3000, { type: "TAB", tab: NEWS });
    expect(sim.intervals()).toEqual([
      ["leetcode.com", 0, 1800],
      ["leetcode.com", 1800, 3000],
    ]);
  });

  it("AC7 TRK-09 a run crossing local midnight produces two intervals, one per day", () => {
    const sim = new Sim();
    const at = 14 * 3600 - 600; // 23:50 local
    sim.send(at, { type: "START" });
    for (const e of [
      { type: "AUTH", connected: true },
      { type: "SETTINGS", trackingEnabled: true },
      { type: "DOMAINS", domains: ["leetcode.com"] },
      { type: "IDLE", state: "active" },
      { type: "TAB", tab: LEETCODE },
    ] as EngineEvent[]) {
      sim.send(at, e);
    }
    sim.heartbeats(at, at + 1200, LEETCODE, "active");
    sim.send(at + 1200, { type: "TAB", tab: NEWS });
    const midnight = 14 * 3600; // 00:00 local = 03:00 UTC
    expect(sim.intervals()).toEqual([
      ["leetcode.com", at, midnight],
      ["leetcode.com", midnight, at + 1200],
    ]);
  });
});

describe("Engine B — rules", () => {
  it("TRK-09a boundaries are computed: a late heartbeat never makes an interval exceed MAX_INTERVAL_S", () => {
    const sim = studying();
    // Heartbeats delayed to 90 s (still under the gap threshold).
    for (let t = 90; t <= 1890; t += 90)
      sim.send(t, { type: "HEARTBEAT", tab: LEETCODE, idle: "active", mediaIdle: "active" });
    sim.send(1900, { type: "TAB", tab: NEWS });
    expect(sim.intervals()).toEqual([
      ["leetcode.com", 0, 1800],
      ["leetcode.com", 1800, 1900],
    ]);
  });

  it("TRK-09a several boundaries passed at once are all closed (max length and midnight)", () => {
    const sim = new Sim();
    const at = 14 * 3600 - 2000; // 23:26:40 local
    sim.send(at, { type: "AUTH", connected: true });
    sim.send(at, { type: "SETTINGS", trackingEnabled: true });
    sim.send(at, { type: "DOMAINS", domains: ["leetcode.com"] });
    sim.send(at, { type: "IDLE", state: "active" });
    sim.send(at, { type: "TAB", tab: LEETCODE });
    // Heartbeats every 100 s (< GAP_S) across both boundaries.
    for (let t = at + 100; t <= at + 4000; t += 100)
      sim.send(t, { type: "HEARTBEAT", tab: LEETCODE, idle: "active", mediaIdle: "active" });
    sim.send(at + 4000, { type: "TAB", tab: NEWS });
    const midnight = 14 * 3600;
    expect(sim.intervals()).toEqual([
      ["leetcode.com", at, at + 1800],
      ["leetcode.com", at + 1800, midnight],
      ["leetcode.com", midnight, midnight + 1800],
      ["leetcode.com", midnight + 1800, at + 4000],
    ]);
  });

  it("TRK-10 intervals shorter than MIN_INTERVAL_S are discarded; timestamps are truncated to seconds", () => {
    const sim = studying();
    sim.send(4, { type: "TAB", tab: NEWS }, 999);
    expect(sim.intervals()).toEqual([]);
    sim.send(10, { type: "TAB", tab: LEETCODE }, 750);
    sim.send(20, { type: "TAB", tab: NEWS }, 250);
    expect(sim.intervals()).toEqual([["leetcode.com", 10, 20]]);
    expect(sim.emitted()[0]?.started_at).toMatch(/:\d\dZ$/);
    expect(TRACKING.MIN_INTERVAL_S).toBe(5);
  });

  it("TRK-10 each interval has a fresh UUIDv4 id assigned at open and the device id", () => {
    const sim = studying();
    sim.heartbeats(0, 3000, LEETCODE, "active");
    sim.send(3000, { type: "TAB", tab: NEWS });
    const [a, b] = sim.emitted();
    expect(a?.id).not.toBe(b?.id);
    expect(a?.device_id).toBe("00000000-0000-4000-8000-00000000d001");
    for (const i of sim.emitted()) expect(IntervalSchema.safeParse(i).success).toBe(true);
  });

  it("TRK-11 intervals never overlap, across pauses, domain changes and splits", () => {
    const sim = studying();
    sim.heartbeats(0, 1900, LEETCODE, "active");
    sim.send(1900, { type: "TAB", tab: tab("https://neetcode.io/") });
    sim.send(2000, { type: "IDLE", state: "idle" });
    sim.send(2100, { type: "IDLE", state: "active" });
    sim.send(2200, { type: "TAB", tab: NEWS });
    const list = sim.intervals();
    for (let i = 1; i < list.length; i++) {
      expect(list[i]?.[1]).toBeGreaterThanOrEqual(list[i - 1]?.[2] ?? 0);
    }
    expect(list).toHaveLength(4);
  });

  it("TRK-14 the gap rule applies to every event, not only worker start", () => {
    const sim = studying();
    sim.heartbeats(0, 120, LEETCODE, "active"); // OS sleeps after 120
    sim.send(120 + GAP_S + 1, { type: "IDLE", state: "active" }); // wake: first event is IDLE
    expect(sim.intervals()).toEqual([["leetcode.com", 0, 120]]);
    // Observations were discarded: the IDLE alone does not reopen, a fresh TAB does.
    expect(sim.state.open).toBeNull();
    sim.send(250, { type: "TAB", tab: LEETCODE });
    expect(sim.state.open).toMatchObject({ domain: "leetcode.com", startedAt: T0 + 250 });
  });

  it("TRK-14 a gap shorter than two heartbeat periods is not a gap", () => {
    const sim = studying();
    sim.send(GAP_S, { type: "HEARTBEAT", tab: LEETCODE, idle: "active", mediaIdle: "active" });
    sim.send(GAP_S + 30, { type: "TAB", tab: NEWS });
    expect(sim.intervals()).toEqual([["leetcode.com", 0, GAP_S + 30]]);
  });

  it("TRK-14 the gap close also splits at boundaries that passed before the last heartbeat", () => {
    const sim = studying();
    sim.heartbeats(0, 1860, LEETCODE, "active");
    sim.send(1860 + 600, { type: "HEARTBEAT", tab: LEETCODE, idle: "active", mediaIdle: "active" });
    expect(sim.intervals()).toEqual([
      ["leetcode.com", 0, 1800],
      ["leetcode.com", 1800, 1860],
    ]);
  });

  it("TRK-15 the clock moving backwards closes at the last heartbeat and never overlaps", () => {
    const sim = studying();
    sim.heartbeats(0, 300, LEETCODE, "active");
    sim.send(240, { type: "HEARTBEAT", tab: LEETCODE, idle: "active", mediaIdle: "active" }); // clock −60 s
    expect(sim.intervals()).toEqual([["leetcode.com", 0, 300]]);
    expect(sim.state.open).toBeNull();
    sim.send(240, { type: "IDLE", state: "active" });
    sim.send(250, { type: "TAB", tab: LEETCODE });
    expect(sim.state.open).toBeNull(); // before 300: would overlap
    sim.send(310, { type: "HEARTBEAT", tab: LEETCODE, idle: "active", mediaIdle: "active" });
    expect(sim.state.open).toMatchObject({ startedAt: T0 + 310 });
    sim.send(400, { type: "TAB", tab: NEWS });
    expect(sim.intervals()).toEqual([
      ["leetcode.com", 0, 300],
      ["leetcode.com", 310, 400],
    ]);
  });

  it("TRK-08 sign-out and tracking disabled close the interval", () => {
    const signOut = studying();
    signOut.send(60, { type: "AUTH", connected: false });
    expect(signOut.intervals()).toEqual([["leetcode.com", 0, 60]]);
    const disabled = studying();
    disabled.send(70, { type: "SETTINGS", trackingEnabled: false });
    expect(disabled.intervals()).toEqual([["leetcode.com", 0, 70]]);
  });

  it("TRK-08 a worker restart that finds a different tab closes the interval when the fresh tab arrives", () => {
    const sim = studying();
    sim.heartbeats(0, 60, LEETCODE, "active");
    sim.send(90, { type: "START" });
    sim.send(90, { type: "TAB", tab: NEWS }, 20);
    expect(sim.intervals()).toEqual([["leetcode.com", 0, 90]]);
  });

  it("TRK-12 lastInputAt follows the idle state", () => {
    const sim = studying();
    expect(sim.state.lastInputAt).toBe(T0);
    sim.send(100, { type: "IDLE", state: "idle" });
    expect(sim.state.lastInputAt).toBe(T0 + 100 - TRACKING.IDLE_THRESHOLD_S);
    sim.send(200, { type: "IDLE", state: "active" });
    expect(sim.state.lastInputAt).toBe(T0 + 200);
  });

  it("TRK-16 step is pure: the input state is never mutated", () => {
    const sim = studying();
    const before = structuredClone(sim.state);
    step(sim.state, { type: "TAB", tab: NEWS }, (T0 + 50) * 1000, makeEnv());
    step(
      sim.state,
      { type: "HEARTBEAT", tab: LEETCODE, idle: "active", mediaIdle: "active" },
      (T0 + 9999) * 1000,
      makeEnv(),
    );
    expect(sim.state).toEqual(before);
  });

  it("requery requests are not duplicated within one step", () => {
    const sim = studying();
    const r = sim.send(GAP_S + 100, { type: "DOMAINS", domains: ["leetcode.com"] });
    expect(r.effects.filter((e) => e.type === "REQUERY_TAB")).toHaveLength(1);
  });
});

describe("localMidnightAfter (TRK-09 default)", () => {
  it("returns the next local midnight strictly after t, in the runtime time zone", () => {
    const t = T0 + 123;
    const m = localMidnightAfter(t);
    const d = new Date(m * 1000);
    expect(m).toBeGreaterThan(t);
    expect([d.getHours(), d.getMinutes(), d.getSeconds()]).toEqual([0, 0, 0]);
    expect(localMidnightAfter(m)).toBeGreaterThan(m);
    expect(m - t).toBeLessThanOrEqual(25 * 3600);
  });
});
