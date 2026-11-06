/**
 * Engine B — intervals (specs/v0/01-tracking.md TRK-08..11, 09a, 12, 14, 15, 16).
 *
 * The tracking engine's single entry point: `step(state, event, now, env) → { state, effects }`.
 * Pure: time comes in as `now`, randomness and the local calendar through `env`. Engine A
 * (`signals.ts`) decides *what* is being studied; this module turns that into closed intervals.
 *
 * Times are whole epoch seconds internally (TRK-10 truncation happens once, on input), so
 * consecutive intervals share exact boundaries and never overlap (TRK-11).
 */
import { type Interval, TRACKING } from "@careeros/shared";
import {
  INITIAL_SIGNALS,
  reduceSignals,
  type SignalEffect,
  type SignalEvent,
  type Signals,
  trackingTarget,
} from "./signals";

export interface OpenInterval {
  /** UUIDv4 generated at open (TRK-10). */
  id: string;
  domain: string;
  /** Epoch seconds. */
  startedAt: number;
}

/** Everything the engine needs between events; persisted on every step (TRK-12). */
export interface EngineState {
  signals: Signals;
  open: OpenInterval | null;
  /**
   * Epoch seconds of the last heartbeat *or processed event*: the last moment the engine is
   * known to have been running. TRK-14/15 close at this checkpoint.
   */
  lastHeartbeatAt: number | null;
  /** Epoch seconds; estimate of the last user input (TRK-12). Informational. */
  lastInputAt: number | null;
  /**
   * TRK-11/15: after the clock moved backwards, no interval may start before this moment, so new
   * intervals never overlap the ones already recorded.
   */
  notBefore: number | null;
}

export type EngineEvent =
  | SignalEvent
  /** The service worker (re)started (TRK-19): confirm the stored observations. */
  | { type: "START" };

export type EngineEffect =
  | SignalEffect
  /** A closed interval ready for the outbox (#17). */
  | { type: "EMIT_INTERVAL"; interval: Interval };

export interface EngineEnv {
  deviceId: string;
  /** UUIDv4 generator. */
  newId: () => string;
  /** First local midnight strictly after `t` (epoch seconds) in the device's time zone (TRK-09). */
  nextLocalMidnight: (t: number) => number;
}

export const INITIAL_ENGINE_STATE: EngineState = {
  signals: INITIAL_SIGNALS,
  open: null,
  lastHeartbeatAt: null,
  lastInputAt: null,
  notBefore: null,
};

/** Default for `EngineEnv.nextLocalMidnight`: the runtime's local time zone, DST-aware. */
export function localMidnightAfter(t: number): number {
  const d = new Date(t * 1000);
  d.setHours(24, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

/** Heartbeat silence after which the engine assumes it was not running (TRK-14). */
export const GAP_S = 2 * TRACKING.HEARTBEAT_PERIOD_MIN * 60;

/** TRK-15: backward steps up to this size are clock noise (NTP/VM): treated as no time passing. */
export const CLOCK_JITTER_S = 2;

/**
 * TRK-15: the longest a backward jump may block new intervals. Larger jumps mean the old clock
 * was wrong (e.g. set in the future); waiting for it could block tracking for months, so the
 * possible overlap with those wrongly dated intervals is accepted instead.
 */
export const CLOCK_BACK_MAX_BLOCK_S = TRACKING.MAX_INTERVAL_S;

const iso = (t: number) => `${new Date(t * 1000).toISOString().slice(0, 19)}Z`;

/** TRK-10: a closed interval, or nothing when it is shorter than MIN_INTERVAL_S. */
function emit(open: OpenInterval, endedAt: number, env: EngineEnv): EngineEffect[] {
  if (endedAt - open.startedAt < TRACKING.MIN_INTERVAL_S) return [];
  return [
    {
      type: "EMIT_INTERVAL",
      interval: {
        id: open.id,
        device_id: env.deviceId,
        domain: open.domain,
        started_at: iso(open.startedAt),
        ended_at: iso(endedAt),
      },
    },
  ];
}

/** TRK-09/09a: the next computed boundary of an open interval (max length or local midnight). */
function boundaryOf(open: OpenInterval, env: EngineEnv): number {
  const max = open.startedAt + TRACKING.MAX_INTERVAL_S;
  const midnight = env.nextLocalMidnight(open.startedAt);
  // Guard against a bad calendar function: it must move forward, or it is ignored.
  return Number.isFinite(midnight) && midnight > open.startedAt ? Math.min(max, midnight) : max;
}

/**
 * TRK-09a: rolls the open interval over every boundary up to `t`, emitting each piece and
 * reopening at the boundary itself. Returns the interval still open at `t`.
 */
function rollTo(
  open: OpenInterval,
  t: number,
  env: EngineEnv,
  effects: EngineEffect[],
): OpenInterval {
  let current = open;
  for (let b = boundaryOf(current, env); b <= t; b = boundaryOf(current, env)) {
    effects.push(...emit(current, b, env));
    current = { id: env.newId(), domain: current.domain, startedAt: b };
  }
  return current;
}

/** Closes the open interval at `t` (TRK-08), splitting at boundaries first. */
function closeAt(open: OpenInterval, t: number, env: EngineEnv, effects: EngineEffect[]) {
  const end = Math.max(t, open.startedAt);
  effects.push(...emit(rollTo(open, end, env, effects), end, env));
}

/**
 * Processes one event. Pure. The adapter must persist the new `state` **and** the emitted
 * intervals in one storage write (TRK-12/17): replaying a step from an older state would give
 * rolled-over pieces new ids and double-count them.
 */
export function step(
  before: EngineState,
  event: EngineEvent,
  nowMs: number,
  env: EngineEnv,
): { state: EngineState; effects: EngineEffect[] } {
  if (!Number.isFinite(nowMs)) return { state: before, effects: [] };
  const checkpoint = before.lastHeartbeatAt ?? null;
  let now = Math.floor(nowMs / 1000); // TRK-10: whole seconds
  // TRK-15: tiny backward steps are noise — never split an interval or drop a media hold for them.
  if (checkpoint !== null && now < checkpoint && checkpoint - now <= CLOCK_JITTER_S)
    now = checkpoint;
  const effects: EngineEffect[] = [];
  let { signals, open } = before;
  let lastInputAt = before.lastInputAt ?? null;
  let notBefore = before.notBefore ?? null;

  // TRK-15 clock moved backwards / TRK-14 gap (crash, OS sleep, browser closed): close at the
  // last known-running moment and start from scratch — Engine A discards stale observations and
  // asks for fresh ones.
  const clockBack = checkpoint !== null && now < checkpoint;
  const gap = checkpoint !== null && now - checkpoint > GAP_S;
  if ((clockBack || gap) && open && checkpoint !== null) {
    closeAt(open, checkpoint, env, effects);
    open = null;
  }
  if (clockBack && checkpoint !== null) {
    // Never lower an existing block: repeated jumps must not reopen recorded time (TRK-11).
    // A jump beyond the cap drops the block entirely (the old clock was wrong).
    notBefore =
      checkpoint - now <= CLOCK_BACK_MAX_BLOCK_S
        ? Math.max(notBefore ?? checkpoint, checkpoint)
        : null;
  }
  if (clockBack || gap) {
    const r = reduceSignals(signals, { type: "RESYNC" });
    signals = r.signals;
    effects.push(...r.effects);
  } else if (event.type === "START") {
    // MV3 restarts the worker all the time (Chrome wakes it for every event, so stored signals
    // are current). Keep them — and the open interval — but confirm with fresh observations;
    // a mismatch closes the interval as soon as they arrive (same serialized queue, TRK-17).
    effects.push({ type: "REQUERY_TAB" }, { type: "REQUERY_IDLE" });
  }

  // TRK-09a: boundaries that passed since the last event are closed at the boundary itself.
  if (open) open = rollTo(open, now, env, effects);

  if (event.type !== "START") {
    const idleBefore = signals.idle;
    const r = reduceSignals(signals, event);
    signals = r.signals;
    for (const e of r.effects) {
      // Requery requests are idempotent: ask once per step.
      if (!effects.some((x) => x.type === e.type)) effects.push(e);
    }
    // TRK-12 estimate: idle detection fires IDLE_THRESHOLD_S after the last input.
    if (signals.idle === "active") lastInputAt = now;
    else if (idleBefore === "active" && signals.idle === "idle") {
      lastInputAt = now - TRACKING.IDLE_THRESHOLD_S;
    }
  }

  // TRK-08: close on any change of target (pause, domain change, eligibility loss) and open
  // a new interval when there is something to track.
  const target = trackingTarget(signals);
  if (open && open.domain !== target) {
    closeAt(open, now, env, effects);
    open = null;
  }
  if (notBefore !== null && now >= notBefore) notBefore = null;
  if (!open && target && notBefore === null) {
    open = { id: env.newId(), domain: target, startedAt: now };
  }

  return { state: { signals, open, lastHeartbeatAt: now, lastInputAt, notBefore }, effects };
}
