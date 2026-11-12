/**
 * Runs the pure engine against Chrome (TRK-12, TRK-13, TRK-17, TRK-19).
 *
 * Every event goes through one serialized queue. Inside a queue slot the tracker loads the
 * stored state, gathers the event's observations (so a slow query can never overwrite a newer
 * event), steps the engine, commits state + outbox in one write, then answers the engine's
 * re-query effects in the same slot.
 */
import type { Interval } from "@careeros/shared";
import { type EngineEffect, type EngineEnv, type EngineEvent, step } from "../../engine/engine";
import type { IdleState, TabSnapshot } from "../../engine/signals";
import type { Logger } from "../../lib/log";
import { createSerialQueue } from "./queue";
import type { TrackingStore } from "./store";

/** What the tracker needs from the browser (implemented in chrome-port.ts). */
export interface BrowserPort {
  /** Active tab of the focused window, or null when no Chrome window is focused. */
  focusedTab(): Promise<TabSnapshot | null>;
  /** `chrome.idle.queryState(seconds)`. */
  idleState(seconds: number): Promise<IdleState>;
}

/** An event, or a function that gathers it inside the queue slot. */
export type EventSource = EngineEvent | (() => Promise<EngineEvent>);

/** Re-query rounds per slot; the engine asks at most twice, so this only guards against bugs. */
const MAX_EFFECT_ROUNDS = 4;
/** A slot that has not settled by then releases the queue (a hung Chrome API must not freeze it). */
export const SLOT_TIMEOUT_MS = 10_000;

/** Thrown to the caller of `exclusive` when its task hit SLOT_TIMEOUT_MS (TRK-17a). */
export class SlotTimeoutError extends Error {
  constructor() {
    super("tracker slot timed out");
    this.name = "SlotTimeoutError";
  }
}

/**
 * TRK-17a (#56): handed to every queue task. `stale()` turns true once the slot timed out and
 * the queue moved on; a task must check it right before each write, so its late work is
 * dropped instead of overwriting what later slots stored.
 */
export interface SlotGuard {
  stale(): boolean;
}

export function createTracker(deps: {
  store: TrackingStore;
  browser: BrowserPort;
  env: () => Promise<EngineEnv>;
  now: () => number;
  log: Logger;
  idleThresholdS: number;
}) {
  const { store, browser, now, log } = deps;
  const enqueue = createSerialQueue();
  /**
   * TRK-17a (#56): generation counter. Each slot records the generation it runs in; a timeout
   * moves the counter on, so every write the timed-out slot still attempts is dropped.
   */
  let generation = 0;

  /** Runs `task` in the queue with a guard; rejects with SlotTimeoutError after the timeout. */
  function runSlot<T>(task: (slot: SlotGuard) => Promise<T>): Promise<T> {
    return enqueue(async () => {
      const mine = generation;
      const slot: SlotGuard = { stale: () => generation !== mine };
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          generation += 1;
          reject(new SlotTimeoutError());
        }, SLOT_TIMEOUT_MS);
      });
      try {
        return await Promise.race([task(slot), timeout]);
      } finally {
        clearTimeout(timer);
      }
    });
  }

  async function stepAndCommit(
    event: EngineEvent,
    env: EngineEnv,
    slot: SlotGuard,
  ): Promise<EngineEffect[]> {
    if (slot.stale()) return [];
    const { state, outbox, droppedCount } = await store.load();
    const result = step(state, event, now(), env);
    const emitted: Interval[] = result.effects.flatMap((e) =>
      e.type === "EMIT_INTERVAL" ? [e.interval] : [],
    );
    // A slot that timed out while loading must not overwrite what later slots stored.
    if (slot.stale()) return [];
    await store.commit(result.state, outbox, emitted, droppedCount);
    log.debug("tracking.step", {
      event: event.type,
      open: result.state.open?.domain ?? null,
      emitted: emitted.length,
    });
    return result.effects;
  }

  async function process(source: EventSource, slot: SlotGuard): Promise<void> {
    const env = await deps.env();
    const event = typeof source === "function" ? await source() : source;
    let effects = await stepAndCommit(event, env, slot);
    for (let round = 0; round < MAX_EFFECT_ROUNDS && effects.length > 0; round++) {
      const next: EngineEffect[] = [];
      for (const effect of effects) {
        if (effect.type === "REQUERY_TAB") {
          next.push(
            ...(await stepAndCommit({ type: "TAB", tab: await browser.focusedTab() }, env, slot)),
          );
        } else if (effect.type === "REQUERY_IDLE") {
          const state = await browser.idleState(deps.idleThresholdS);
          next.push(...(await stepAndCommit({ type: "IDLE", state }, env, slot)));
        }
      }
      effects = next;
    }
  }

  return {
    /**
     * Queues an event; resolves `true` once it (and its re-queries) has been processed and
     * stored, `false` when it failed or timed out (logged, never thrown).
     */
    dispatch(source: EventSource): Promise<boolean> {
      return runSlot((slot) => process(source, slot)).then(
        () => true,
        (error: unknown) => {
          if (error instanceof SlotTimeoutError) {
            log.error("tracking.step_timeout", {});
          } else {
            // Never log the error message itself: it could contain a URL (SEC-06).
            log.error("tracking.step_failed", {
              error: error instanceof Error ? error.name : "unknown",
            });
          }
          return false;
        },
      );
    },
    /**
     * Runs `task` exclusively in the queue (e.g. the local store's read-modify-writes). Like an
     * event, it is released after SLOT_TIMEOUT_MS (rejects with SlotTimeoutError); the task
     * must check `slot.stale()` before writing (TRK-17a).
     */
    exclusive<T>(task: (slot?: SlotGuard) => Promise<T>): Promise<T> {
      return runSlot(task);
    },
  };
}

export type Tracker = ReturnType<typeof createTracker>;
