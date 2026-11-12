/**
 * Local store for closed intervals after the engine (SYNC-01, 05, 07, 08, ADR-0002):
 * outbox → (server confirms) → synced today | deferred (ended in the future by the server's
 * clock, retried later) | quarantine. Every read-modify-write runs inside the tracker's queue
 * (`exclusive`), because the engine appends to the outbox from the same queue — so no update
 * is ever lost. A task whose slot timed out writes nothing (TRK-17a).
 *
 * Never call these from inside `tracker.exclusive` / `dispatch`: the queue is not re-entrant
 * and the call would wait for its own slot forever.
 */
import { DATA, type Interval, SYNC } from "@careeros/shared";
import type { KeyValueArea } from "../auth/storage";
import {
  DEFERRED_KEY,
  DROPPED_COUNT_KEY,
  OUTBOX_KEY,
  QUARANTINE_KEY,
  SYNCED_TODAY_KEY,
} from "./keys";
import {
  type DeferredInterval,
  parseDeferred,
  parseDroppedCount,
  parseOutbox,
  parseOutboxCounted,
} from "./store";
import type { SlotGuard } from "./tracker";

export interface LocalCounts {
  /** In the outbox, waiting for upload. */
  pending: number;
  /** SYNC-05a: rejected as ending in the future (device clock ahead), retried later. */
  deferred: number;
  /** SYNC-05: rejected by the server, kept but never retried. */
  quarantined: number;
  /** SYNC-07/07a: dropped as too old or unreadable. */
  dropped: number;
}

/** What one settle did with the rejected part of a batch. */
export interface SettleResult {
  /** Rejected only because they ended in the future by the server's clock (SYNC-05a). */
  deferred: number;
  quarantined: number;
}

const startedMs = (i: Interval) => Date.parse(i.started_at);
const FUTURE_TOLERANCE_MS = DATA.FUTURE_TOLERANCE_S * 1000;
const CLOCK_SLACK_MS = SYNC.CLOCK_SLACK_S * 1000;
const RETRY_CAP_MS = SYNC.DEFERRED_RETRY_CAP_MIN * 60_000;
const MAX_AGE_MS = SYNC.LOCAL_QUEUE_MAX_AGE_D * 86_400_000;

/**
 * SYNC-05a: whether a rejected interval was (most likely) refused by DATA-07 for ending more
 * than the tolerance after the server's clock. `CLOCK_SLACK_S` is taken off the server's time
 * so a rejection near the boundary (whole-second header, server compared slightly earlier) is
 * retried rather than quarantined. Without the server's time nothing is known.
 */
export function endedInServerFuture(i: Interval, serverNow: number | null): boolean {
  return (
    serverNow !== null && Date.parse(i.ended_at) > serverNow - CLOCK_SLACK_MS + FUTURE_TOLERANCE_MS
  );
}

/**
 * SYNC-05a: whether a deferred interval may be sent again. Its due time is server-relative: its
 * `ended_at` must be in the past by the server's clock, estimated from the latest measured skew
 * (`skewMs` = local − server, re-measured on every upload). Independently, it is due at its
 * capped `retryAt` (≤ DEFERRED_RETRY_CAP_MIN after deferral) or as soon as `retryAt` lies
 * further ahead than the cap (the local clock was moved back), so no correction strands it.
 */
export function deferredDue(d: DeferredInterval, now: number, skewMs: number | null): boolean {
  if (now >= d.retryAt || d.retryAt - now > RETRY_CAP_MS) return true;
  return dueBySkew(d, now, skewMs);
}

/** SYNC-05a: the measured-skew rule alone (`ended_at` passed by the estimated server clock). */
function dueBySkew(d: DeferredInterval, now: number, skewMs: number | null): boolean {
  return skewMs !== null && now - skewMs >= Date.parse(d.interval.ended_at);
}

export function createOutbox(deps: {
  area: KeyValueArea;
  /** Runs a task exclusively in the tracker queue; the guard turns stale on a timeout. */
  exclusive: <T>(task: (slot?: SlotGuard) => Promise<T>) => Promise<T>;
  now: () => number;
  /** Epoch ms of the start of the local day containing `t` (TRK-09 calendar). */
  startOfLocalDay: (t: number) => number;
}) {
  const { area, exclusive } = deps;
  /**
   * SYNC-05a (re-review of #150): ids of deferred intervals in the last batch whose retry counts
   * toward CLOCK_RETRY_MAX — those the measured skew said were due, or any when no skew is known.
   * A cap-triggered retry while the skew is known is only a check: it does not count, so a clock
   * hours ahead cannot use up the retries before the interval is due. Nothing retries forever:
   * deferred intervals are dropped at LOCAL_QUEUE_MAX_AGE_D (prune). In memory: lost on a worker
   * restart, which only makes one retry not count.
   */
  let countedRetries = new Set<string>();

  async function read() {
    const stored = await area.get([
      OUTBOX_KEY,
      DEFERRED_KEY,
      QUARANTINE_KEY,
      SYNCED_TODAY_KEY,
      DROPPED_COUNT_KEY,
    ]);
    const outbox = parseOutboxCounted(stored[OUTBOX_KEY]);
    const deferred = parseDeferred(stored[DEFERRED_KEY]);
    return {
      outbox: outbox.items,
      deferred: deferred.items,
      quarantine: parseOutbox(stored[QUARANTINE_KEY]),
      syncedToday: parseOutbox(stored[SYNCED_TODAY_KEY]),
      // SYNC-07a (#56): unreadable pending entries are lost data: counted with the next write.
      dropped: parseDroppedCount(stored[DROPPED_COUNT_KEY]) + outbox.invalid + deferred.invalid,
    };
  }

  /** TRK-17a: a task that outlived its slot writes nothing. */
  async function write(slot: SlotGuard | undefined, items: Record<string, unknown>) {
    if (slot?.stale()) return;
    await area.set(items);
  }

  return {
    /**
     * SYNC-03: the oldest intervals waiting for upload: deferred ones that are due (they are
     * older), then the outbox (kept in closing order).
     */
    batch(max: number = SYNC.SYNC_BATCH_MAX, skewMs: number | null = null): Promise<Interval[]> {
      return exclusive(async () => {
        const s = await read();
        const now = deps.now();
        const dueEntries = s.deferred.filter((d) => deferredDue(d, now, skewMs));
        const picked = [...dueEntries.map((d) => d.interval), ...s.outbox].slice(0, max);
        const pickedIds = new Set(picked.map((i) => i.id));
        countedRetries = new Set(
          dueEntries
            .filter((d) => pickedIds.has(d.interval.id))
            .filter((d) => skewMs === null || dueBySkew(d, now, skewMs))
            .map((d) => d.interval.id),
        );
        return picked;
      });
    },

    /**
     * SYNC-04/05/05a/08: after an upload of `sent`, confirmed ids move to "synced today" (or
     * are forgotten if not from today). A sent interval the server did not confirm is deferred
     * when it ends in the future by the server's clock (`serverNow`), until CLOCK_RETRY_MAX
     * rejections; anything else goes to quarantine.
     */
    settle(
      sent: Interval[],
      confirmedIds: readonly string[],
      serverNow: number | null = null,
    ): Promise<SettleResult> {
      return exclusive(async (slot) => {
        const s = await read();
        const now = deps.now();
        const sentIds = new Set(sent.map((i) => i.id));
        const confirmed = new Set(confirmedIds);
        const today = deps.startOfLocalDay(now);
        const attempts = new Map(s.deferred.map((d) => [d.interval.id, d.attempts]));
        // The stored copies: anything cleared meanwhile stays cleared.
        const settled = [
          ...s.deferred.filter((d) => sentIds.has(d.interval.id)).map((d) => d.interval),
          ...s.outbox.filter((i) => sentIds.has(i.id)),
        ];
        const toQuarantine: Interval[] = [];
        const toDefer: DeferredInterval[] = [];
        for (const i of settled) {
          if (confirmed.has(i.id)) continue;
          const previous = attempts.get(i.id);
          const tries = previous === undefined ? 1 : previous + (countedRetries.has(i.id) ? 1 : 0);
          if (
            serverNow !== null &&
            endedInServerFuture(i, serverNow) &&
            tries <= SYNC.CLOCK_RETRY_MAX
          ) {
            // Fallback due time in local terms, capped; the skew rule usually fires first.
            const wait = Math.max(0, Date.parse(i.ended_at) - serverNow);
            toDefer.push({
              interval: i,
              retryAt: now + Math.min(wait, RETRY_CAP_MS),
              attempts: tries,
            });
          } else {
            toQuarantine.push(i);
          }
        }
        await write(slot, {
          [OUTBOX_KEY]: s.outbox.filter((i) => !sentIds.has(i.id)),
          [DEFERRED_KEY]: [...s.deferred.filter((d) => !sentIds.has(d.interval.id)), ...toDefer],
          [SYNCED_TODAY_KEY]: [
            ...s.syncedToday,
            ...settled.filter((i) => confirmed.has(i.id) && startedMs(i) >= today),
          ],
          [QUARANTINE_KEY]: [...s.quarantine, ...toQuarantine],
          [DROPPED_COUNT_KEY]: s.dropped,
        });
        return { deferred: toDefer.length, quarantined: toQuarantine.length };
      });
    },

    /**
     * SYNC-07/08: drop pending and deferred intervals older than LOCAL_QUEUE_MAX_AGE_D
     * (counted, like unreadable entries, SYNC-07a) and synced intervals from previous days.
     * SYNC-05a: deferred and quarantined intervals starting more than LOCAL_QUEUE_MAX_AGE_D in
     * the future (recorded with a clock that was far ahead, then corrected) can never be
     * accepted within the retention window: dropped too.
     */
    prune(): Promise<void> {
      return exclusive(async (slot) => {
        const s = await read();
        const now = deps.now();
        const oldest = now - MAX_AGE_MS;
        const inWindow = (i: Interval) =>
          startedMs(i) >= oldest && startedMs(i) <= now + MAX_AGE_MS;
        const today = deps.startOfLocalDay(now);
        const keep = s.outbox.filter((i) => startedMs(i) >= oldest);
        const keepDeferred = s.deferred.filter((d) => inWindow(d.interval));
        const tooOld = s.outbox.length - keep.length + (s.deferred.length - keepDeferred.length);
        await write(slot, {
          [OUTBOX_KEY]: keep,
          [DEFERRED_KEY]: keepDeferred,
          [SYNCED_TODAY_KEY]: s.syncedToday.filter((i) => startedMs(i) >= today),
          [QUARANTINE_KEY]: s.quarantine.filter(inWindow),
          [DROPPED_COUNT_KEY]: s.dropped + tooOld,
        });
      });
    },

    /** Counts for the popup footer and for disconnect (AUTH-12). */
    counts(): Promise<LocalCounts> {
      return exclusive(async () => {
        const s = await read();
        return {
          pending: s.outbox.length,
          deferred: s.deferred.length,
          quarantined: s.quarantine.length,
          dropped: s.dropped,
        };
      });
    },

    /** SYNC-12: this device's intervals of today (synced + pending + deferred). */
    today(): Promise<Interval[]> {
      return exclusive(async () => {
        const s = await read();
        const today = deps.startOfLocalDay(deps.now());
        return [...s.syncedToday, ...s.outbox, ...s.deferred.map((d) => d.interval)].filter(
          (i) => startedMs(i) >= today,
        );
      });
    },

    /** AUTH-11/12: removes everything above (the engine state is cleared by the store). */
    clear(): Promise<void> {
      return exclusive(() =>
        area.remove([
          OUTBOX_KEY,
          DEFERRED_KEY,
          QUARANTINE_KEY,
          SYNCED_TODAY_KEY,
          DROPPED_COUNT_KEY,
        ]),
      );
    },
  };
}

export type Outbox = ReturnType<typeof createOutbox>;
