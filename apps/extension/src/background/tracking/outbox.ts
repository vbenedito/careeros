/**
 * Local store for closed intervals after the engine (SYNC-01, 05, 07, 08, ADR-0002):
 * outbox → (server confirms) → synced today | quarantine. Every read-modify-write runs inside
 * the tracker's queue (`exclusive`), because the engine appends to the outbox from the same
 * queue — so no update is ever lost.
 *
 * Never call these from inside `tracker.exclusive` / `dispatch`: the queue is not re-entrant
 * and the call would wait for its own slot forever.
 */
import { type Interval, SYNC } from "@careeros/shared";
import type { KeyValueArea } from "../auth/storage";
import { DROPPED_COUNT_KEY, OUTBOX_KEY, QUARANTINE_KEY, SYNCED_TODAY_KEY } from "./keys";
import { parseOutbox } from "./store";

export interface LocalCounts {
  pending: number;
  quarantined: number;
  dropped: number;
}

const startedMs = (i: Interval) => Date.parse(i.started_at);

export function createOutbox(deps: {
  area: KeyValueArea;
  /** Runs a task exclusively in the tracker queue. */
  exclusive: <T>(task: () => Promise<T>) => Promise<T>;
  now: () => number;
  /** Epoch ms of the start of the local day containing `t` (TRK-09 calendar). */
  startOfLocalDay: (t: number) => number;
}) {
  const { area, exclusive } = deps;

  async function read() {
    const stored = await area.get([
      OUTBOX_KEY,
      QUARANTINE_KEY,
      SYNCED_TODAY_KEY,
      DROPPED_COUNT_KEY,
    ]);
    const dropped = stored[DROPPED_COUNT_KEY];
    return {
      outbox: parseOutbox(stored[OUTBOX_KEY]),
      quarantine: parseOutbox(stored[QUARANTINE_KEY]),
      syncedToday: parseOutbox(stored[SYNCED_TODAY_KEY]),
      dropped: typeof dropped === "number" && dropped >= 0 ? dropped : 0,
    };
  }

  return {
    /** SYNC-03: the oldest intervals waiting for upload (the outbox is in closing order). */
    batch(max: number = SYNC.SYNC_BATCH_MAX): Promise<Interval[]> {
      return exclusive(async () => (await read()).outbox.slice(0, max));
    },

    /**
     * SYNC-04/05/08: after an upload of `sent`, confirmed ids move to "synced today" (or are
     * forgotten if not from today); sent ids the server did not confirm go to quarantine.
     */
    settle(sent: Interval[], confirmedIds: readonly string[]): Promise<void> {
      return exclusive(async () => {
        const s = await read();
        const sentIds = new Set(sent.map((i) => i.id));
        const confirmed = new Set(confirmedIds);
        const today = deps.startOfLocalDay(deps.now());
        const settled = s.outbox.filter((i) => sentIds.has(i.id));
        await area.set({
          [OUTBOX_KEY]: s.outbox.filter((i) => !sentIds.has(i.id)),
          [SYNCED_TODAY_KEY]: [
            ...s.syncedToday,
            ...settled.filter((i) => confirmed.has(i.id) && startedMs(i) >= today),
          ],
          [QUARANTINE_KEY]: [...s.quarantine, ...settled.filter((i) => !confirmed.has(i.id))],
        });
      });
    },

    /**
     * SYNC-07/08: drop outbox intervals older than LOCAL_QUEUE_MAX_AGE_D (counted) and synced
     * intervals from previous days.
     */
    prune(): Promise<void> {
      return exclusive(async () => {
        const s = await read();
        const now = deps.now();
        const oldest = now - SYNC.LOCAL_QUEUE_MAX_AGE_D * 86_400_000;
        const today = deps.startOfLocalDay(now);
        const keep = s.outbox.filter((i) => startedMs(i) >= oldest);
        await area.set({
          [OUTBOX_KEY]: keep,
          [SYNCED_TODAY_KEY]: s.syncedToday.filter((i) => startedMs(i) >= today),
          [QUARANTINE_KEY]: s.quarantine.filter((i) => startedMs(i) >= oldest),
          [DROPPED_COUNT_KEY]: s.dropped + (s.outbox.length - keep.length),
        });
      });
    },

    /** Counts for the popup footer and for disconnect (AUTH-12). */
    counts(): Promise<LocalCounts> {
      return exclusive(async () => {
        const s = await read();
        return { pending: s.outbox.length, quarantined: s.quarantine.length, dropped: s.dropped };
      });
    },

    /** SYNC-12: this device's intervals of today (synced + pending), for the popup total. */
    today(): Promise<Interval[]> {
      return exclusive(async () => {
        const s = await read();
        const today = deps.startOfLocalDay(deps.now());
        return [...s.syncedToday, ...s.outbox].filter((i) => startedMs(i) >= today);
      });
    },

    /** AUTH-11/12: removes everything above (the engine state is cleared by the store). */
    clear(): Promise<void> {
      return exclusive(() =>
        area.remove([OUTBOX_KEY, QUARANTINE_KEY, SYNCED_TODAY_KEY, DROPPED_COUNT_KEY]),
      );
    },
  };
}

export type Outbox = ReturnType<typeof createOutbox>;

/** Default calendar: the runtime's local time zone. */
export function startOfLocalDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
