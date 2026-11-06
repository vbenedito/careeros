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

  async function stepAndCommit(event: EngineEvent, env: EngineEnv): Promise<EngineEffect[]> {
    const { state, outbox } = await store.load();
    const result = step(state, event, now(), env);
    const emitted: Interval[] = result.effects.flatMap((e) =>
      e.type === "EMIT_INTERVAL" ? [e.interval] : [],
    );
    await store.commit(result.state, outbox, emitted);
    log.debug("tracking.step", {
      event: event.type,
      open: result.state.open?.domain ?? null,
      emitted: emitted.length,
    });
    return result.effects;
  }

  async function process(source: EventSource): Promise<void> {
    const env = await deps.env();
    const event = typeof source === "function" ? await source() : source;
    let effects = await stepAndCommit(event, env);
    for (let round = 0; round < MAX_EFFECT_ROUNDS && effects.length > 0; round++) {
      const next: EngineEffect[] = [];
      for (const effect of effects) {
        if (effect.type === "REQUERY_TAB") {
          next.push(
            ...(await stepAndCommit({ type: "TAB", tab: await browser.focusedTab() }, env)),
          );
        } else if (effect.type === "REQUERY_IDLE") {
          const state = await browser.idleState(deps.idleThresholdS);
          next.push(...(await stepAndCommit({ type: "IDLE", state }, env)));
        }
      }
      effects = next;
    }
  }

  return {
    /** Queues an event; resolves once it (and its re-queries) has been processed and stored. */
    dispatch(source: EventSource): Promise<void> {
      return enqueue(async () => {
        try {
          await process(source);
        } catch (error) {
          // Never log the error message itself: it could contain a URL (SEC-06).
          log.error("tracking.step_failed", {
            error: error instanceof Error ? error.name : "unknown",
          });
        }
      });
    },
    /** Runs `task` exclusively in the queue (e.g. clearing local data between events). */
    exclusive<T>(task: () => Promise<T>): Promise<T> {
      return enqueue(task);
    },
  };
}

export type Tracker = ReturnType<typeof createTracker>;
