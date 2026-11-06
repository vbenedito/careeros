/**
 * Engine B with a fake clock (TRK-08..15, acceptance criteria 1–7 of specs/v0/01-tracking.md).
 * Time is in seconds from T0; local time zone is UTC−3 (America/Sao_Paulo has no DST).
 */
import { IntervalSchema, TRACKING } from "@careeros/shared";
import { describe, expect, it } from "vitest";
import {
  CLOCK_BACK_MAX_BLOCK_S,
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

describe("Engine B — review hardening", () => {
  const hb = (t: TabSnapshot | null = LEETCODE): EngineEvent => ({
    type: "HEARTBEAT",
    tab: t,
    idle: "active",
    mediaIdle: "active",
  });

  it("TRK-11 TRK-15 repeated backward jumps never reopen time that was already recorded", () => {
    const sim = studying();
    sim.heartbeats(0, 300, LEETCODE, "active");
    sim.send(100, hb()); // back 200 s → block until 300
    sim.send(150, hb());
    sim.send(120, hb()); // back again: the block must not drop to 150
    sim.send(160, hb());
    expect(sim.state.open).toBeNull();
    for (let t = 180; t <= 360; t += 60) sim.send(t, hb());
    sim.send(400, { type: "TAB", tab: NEWS });
    const list = sim.intervals();
    expect(list[0]).toEqual(["leetcode.com", 0, 300]);
    for (const [, start] of list.slice(1)) expect(start).toBeGreaterThanOrEqual(300);
  });

  it("TRK-15 backward steps of up to CLOCK_JITTER_S are noise: no split, the media hold survives", () => {
    const sim = studying(true);
    const audibleTab = { ...LEETCODE, audible: true };
    sim.send(60, { type: "IDLE", state: "idle" });
    sim.send(120, { type: "HEARTBEAT", tab: audibleTab, idle: "idle", mediaIdle: "active" }, 999);
    sim.send(119, { type: "HEARTBEAT", tab: audibleTab, idle: "idle", mediaIdle: "active" }, 997);
    expect(sim.state.signals.mediaHold).toBe(true);
    expect(sim.state.open).toMatchObject({ startedAt: T0 });
    sim.send(180, { type: "TAB", tab: NEWS });
    expect(sim.intervals()).toEqual([["leetcode.com", 0, 180]]);
  });

  it("TRK-15 a backward jump larger than CLOCK_BACK_MAX_BLOCK_S does not block tracking", () => {
    const sim = studying();
    sim.heartbeats(0, 120, LEETCODE, "active");
    const back = 120 - CLOCK_BACK_MAX_BLOCK_S - 3600; // clock was an hour+ in the future
    sim.send(back, hb()); // the heartbeat carries fresh observations: tracking resumes at once
    expect(sim.intervals()).toEqual([["leetcode.com", 0, 120]]);
    expect(sim.state.open).toMatchObject({ startedAt: T0 + back });
    expect(sim.state.notBefore).toBeNull();
  });

  it("TRK-13 TRK-14 any processed event is a checkpoint: a crash after a TAB event closes at that event", () => {
    const sim = studying();
    sim.send(30, { type: "TAB", tab: tab("https://neetcode.io/") });
    sim.send(30 + GAP_S + 100, hb());
    expect(sim.intervals()).toEqual([["leetcode.com", 0, 30]]);
  });

  it("TRK-19 START with nothing stored only asks for observations and opens nothing", () => {
    const r = step(INITIAL_ENGINE_STATE, { type: "START" }, T0 * 1000, makeEnv());
    expect(r.effects).toEqual([{ type: "REQUERY_TAB" }, { type: "REQUERY_IDLE" }]);
    expect(r.state.open).toBeNull();
  });

  it("TRK-08 TRK-09a a step that passes a boundary and changes target splits, then closes", () => {
    const sim = studying();
    sim.heartbeats(0, 1780, LEETCODE, "active");
    sim.send(1840, { type: "TAB", tab: tab("https://neetcode.io/") });
    sim.send(1900, { type: "TAB", tab: NEWS });
    expect(sim.intervals()).toEqual([
      ["leetcode.com", 0, 1800],
      ["leetcode.com", 1800, 1840],
      ["neetcode.io", 1840, 1900],
    ]);
  });

  it("TRK-08 removing the current domain from the tracked list closes the interval", () => {
    const sim = studying();
    sim.heartbeats(0, 180, LEETCODE, "active");
    sim.send(200, { type: "DOMAINS", domains: ["neetcode.io"] });
    expect(sim.intervals()).toEqual([["leetcode.com", 0, 200]]);
    expect(sim.state.open).toBeNull();
  });

  it("a non-finite clock or a calendar that does not move forward cannot break the engine", () => {
    const sim = studying();
    const before = sim.state;
    expect(step(before, hb(), Number.NaN, makeEnv())).toEqual({ state: before, effects: [] });
    const stuckEnv: EngineEnv = { ...makeEnv(), nextLocalMidnight: (t) => t };
    const recent = { ...before, lastHeartbeatAt: T0 + 1990 }; // no gap
    const r = step(recent, { type: "TAB", tab: NEWS }, (T0 + 2000) * 1000, stuckEnv);
    const emitted = r.effects.flatMap((e) => (e.type === "EMIT_INTERVAL" ? [e.interval] : []));
    expect(emitted.map((i) => i.ended_at)).toHaveLength(2); // 1800 + 200, never longer
    for (const i of emitted) expect(IntervalSchema.safeParse(i).success).toBe(true);
  });

  it("stored state missing newer fields is tolerated (notBefore/lastInputAt undefined)", () => {
    const sim = studying();
    const legacy = { ...sim.state } as Partial<EngineState>;
    delete legacy.notBefore;
    delete legacy.lastInputAt;
    const r = step(
      legacy as EngineState,
      { type: "TAB", tab: LEETCODE },
      (T0 + 10) * 1000,
      makeEnv(),
    );
    expect(r.state.notBefore).toBeNull();
    expect(r.state.open).not.toBeNull();
  });
});

describe("TRK-09 local midnight with real time zones (DST and fractional offsets)", () => {
  // Node re-reads TZ when it changes; the extension tsconfig has no Node types, hence the cast.
  const processEnv = (
    globalThis as unknown as { process: { env: Record<string, string | undefined> } }
  ).process.env;
  const withTz = (tz: string, fn: () => void) => {
    const saved = processEnv.TZ;
    processEnv.TZ = tz;
    try {
      fn();
    } finally {
      if (saved === undefined) delete processEnv.TZ;
      else processEnv.TZ = saved;
    }
  };
  const at = (iso: string) => Date.parse(iso) / 1000;

  it("TRK-09 America/Sao_Paulo (UTC−3, no DST)", () => {
    withTz("America/Sao_Paulo", () => {
      expect(localMidnightAfter(at("2026-11-09T23:50:00-03:00"))).toBe(
        at("2026-11-10T00:00:00-03:00"),
      );
    });
  });

  it("TRK-09 Asia/Kolkata (UTC+5:30)", () => {
    withTz("Asia/Kolkata", () => {
      expect(localMidnightAfter(at("2026-11-09T23:59:59+05:30"))).toBe(
        at("2026-11-10T00:00:00+05:30"),
      );
    });
  });

  it("TRK-09 America/New_York across the fall-back day (25-hour day)", () => {
    withTz("America/New_York", () => {
      // 2026-11-01: clocks go back at 02:00 EDT → 01:00 EST.
      expect(localMidnightAfter(at("2026-11-01T00:30:00-04:00"))).toBe(
        at("2026-11-02T00:00:00-05:00"),
      );
    });
  });

  it("TRK-09 America/Santiago where midnight itself is skipped (spring forward at 00:00)", () => {
    withTz("America/Santiago", () => {
      // 2026-09-06: 00:00 −04 does not exist; the day starts at 01:00 −03 (same instant).
      const m = localMidnightAfter(at("2026-09-05T23:30:00-04:00"));
      expect(m).toBe(at("2026-09-06T01:00:00-03:00"));
      expect(m).toBeGreaterThan(at("2026-09-05T23:30:00-04:00"));
    });
  });
});

describe("Engine B — randomized invariants (TRK-08..11)", () => {
  it("never emits overlapping, too short, too long, duplicated or day-crossing intervals", () => {
    let seed = 42;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed / 2 ** 31;
    };
    const tabs = [
      LEETCODE,
      NEWS,
      tab("https://neetcode.io/x"),
      null,
      { ...LEETCODE, audible: true },
    ];
    const idles: IdleState[] = ["active", "idle", "locked"];
    const env = makeEnv();
    for (let run = 0; run < 30; run++) {
      let state = INITIAL_ENGINE_STATE;
      let t = T0 + Math.floor(rand() * 86400);
      const out: { start: number; end: number; id: string }[] = [];
      const push = (effects: EngineEffect[]) => {
        for (const e of effects) {
          if (e.type !== "EMIT_INTERVAL") continue;
          expect(IntervalSchema.safeParse(e.interval).success).toBe(true);
          out.push({
            start: Date.parse(e.interval.started_at) / 1000,
            end: Date.parse(e.interval.ended_at) / 1000,
            id: e.interval.id,
          });
        }
      };
      for (const e of [
        { type: "START" },
        { type: "AUTH", connected: true },
        { type: "SETTINGS", trackingEnabled: true },
        { type: "DOMAINS", domains: ["leetcode.com", "neetcode.io"] },
        { type: "IDLE", state: "active" },
      ] as EngineEvent[]) {
        const r = step(state, e, t * 1000, env);
        state = r.state;
        push(r.effects);
      }
      for (let i = 0; i < 300; i++) {
        const roll = rand();
        // Mostly forward steps; sometimes gaps, small and large backward jumps.
        t +=
          roll < 0.85
            ? Math.floor(rand() * 90)
            : roll < 0.93
              ? 200 + Math.floor(rand() * 4000)
              : -Math.floor(rand() * 400);
        const pick = rand();
        const event: EngineEvent =
          pick < 0.4
            ? {
                type: "HEARTBEAT",
                tab: tabs[Math.floor(rand() * tabs.length)] ?? null,
                idle: idles[Math.floor(rand() * 3)] ?? "active",
                mediaIdle: rand() < 0.8 ? "active" : "idle",
              }
            : pick < 0.7
              ? { type: "TAB", tab: tabs[Math.floor(rand() * tabs.length)] ?? null }
              : pick < 0.95
                ? { type: "IDLE", state: idles[Math.floor(rand() * 3)] ?? "active" }
                : { type: "START" };
        const r = step(state, event, t * 1000 + Math.floor(rand() * 1000), env);
        state = r.state;
        push(r.effects);
      }
      // Intervals are emitted in time order except across large backward jumps (accepted).
      const ids = new Set(out.map((i) => i.id));
      expect(ids.size).toBe(out.length);
      for (const i of out) {
        expect(i.end - i.start).toBeGreaterThanOrEqual(TRACKING.MIN_INTERVAL_S);
        expect(i.end - i.start).toBeLessThanOrEqual(TRACKING.MAX_INTERVAL_S);
        expect(env.nextLocalMidnight(i.start)).toBeGreaterThanOrEqual(i.end);
      }
      for (let k = 1; k < out.length; k++) {
        const prev = out[k - 1];
        const cur = out[k];
        if (prev && cur && prev.end - cur.start <= CLOCK_BACK_MAX_BLOCK_S) {
          expect(cur.start).toBeGreaterThanOrEqual(prev.end);
        }
      }
    }
  });
});
