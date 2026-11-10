/**
 * Persistence of the tracking engine (TRK-12, SYNC-01, ADR-0002).
 *
 * The engine state and the outbox are written in **one** `set` per step, so a worker killed
 * mid-step can never replay a step whose intervals were already queued (review of #15).
 * Stored values are validated on load; anything unexpected falls back to the initial state,
 * which fails closed (TRK-01).
 */
import { DomainSchema, type Interval, IntervalSchema } from "@careeros/shared";
import { z } from "zod";
import { type EngineState, INITIAL_ENGINE_STATE } from "../../engine/engine";
import { SYNC_STATE_KEY } from "../../lib/sync-state";
import type { AccountEpoch } from "../account-epoch";
import type { KeyValueArea } from "../auth/storage";
import {
  DOMAINS_CACHE_KEY,
  DROPPED_COUNT_KEY,
  ENGINE_STATE_KEY,
  OUTBOX_KEY,
  QUARANTINE_KEY,
  SYNCED_TODAY_KEY,
  TRACKING_ENABLED_KEY,
} from "./keys";

const epoch = z.number().int().nonnegative();
const nullableEpoch = epoch.nullable().default(null);
const idle = z.enum(["active", "idle", "locked", "unknown"]);

export const EngineStateSchema = z.object({
  signals: z.object({
    connected: z.boolean(),
    trackingEnabled: z.boolean().nullable(),
    trackedDomains: z.array(DomainSchema).nullable(),
    // Only ever a tracked domain (SEC-02): the schema rejects anything that is not a domain.
    focusedDomain: DomainSchema.nullable(),
    audible: z.boolean(),
    idle,
    mediaHold: z.boolean(),
  }),
  open: z.object({ id: z.uuid(), domain: DomainSchema, startedAt: epoch }).nullable(),
  lastHeartbeatAt: nullableEpoch,
  lastInputAt: nullableEpoch,
  notBefore: nullableEpoch,
}) satisfies z.ZodType<EngineState, unknown>;

export function parseEngineState(value: unknown): EngineState {
  const parsed = EngineStateSchema.safeParse(value);
  return parsed.success ? parsed.data : INITIAL_ENGINE_STATE;
}

/** Valid intervals only: a corrupted entry must never block the queue. */
export function parseOutbox(value: unknown): Interval[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const parsed = IntervalSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

export function createTrackingStore(area: KeyValueArea, epoch?: AccountEpoch) {
  return {
    async load(): Promise<{ state: EngineState; outbox: Interval[] }> {
      const stored = await area.get([ENGINE_STATE_KEY, OUTBOX_KEY]);
      return {
        state: parseEngineState(stored[ENGINE_STATE_KEY]),
        outbox: parseOutbox(stored[OUTBOX_KEY]),
      };
    },

    /** One write: the new state plus the outbox with the step's intervals appended. */
    async commit(state: EngineState, outbox: Interval[], emitted: Interval[]): Promise<void> {
      const items: Record<string, unknown> = { [ENGINE_STATE_KEY]: state };
      if (emitted.length > 0) items[OUTBOX_KEY] = [...outbox, ...emitted];
      await area.set(items);
    },

    async outbox(): Promise<Interval[]> {
      return parseOutbox((await area.get(OUTBOX_KEY))[OUTBOX_KEY]);
    },

    /** EXT-UI-06: on unless explicitly turned off. */
    async trackingEnabled(): Promise<boolean> {
      return (await area.get(TRACKING_ENABLED_KEY))[TRACKING_ENABLED_KEY] !== false;
    },

    /**
     * The cached domain list, or null when it has never been loaded (TRK-01). Invalid entries
     * are dropped one by one, never the whole list.
     */
    async trackedDomains(): Promise<string[] | null> {
      const cache = (await area.get(DOMAINS_CACHE_KEY))[DOMAINS_CACHE_KEY] as
        | { domains?: unknown }
        | undefined;
      if (!cache || !Array.isArray(cache.domains)) return null;
      return cache.domains.filter((d): d is string => DomainSchema.safeParse(d).success);
    },

    /**
     * Deletes the account's local tracking data (AUTH-11/12, SEC-14): engine state, outbox,
     * quarantine, today cache, counters, the tracked-domain cache (it belongs to the user) and the
     * sync status.
     * The per-device switch stays.
     */
    async clear(): Promise<void> {
      epoch?.bump();
      await area.remove([
        ENGINE_STATE_KEY,
        OUTBOX_KEY,
        QUARANTINE_KEY,
        SYNCED_TODAY_KEY,
        DROPPED_COUNT_KEY,
        DOMAINS_CACHE_KEY,
        // #113: "Synced · 2h ago" and any backoff belong to the previous account too.
        SYNC_STATE_KEY,
      ]);
    },
  };
}

export type TrackingStore = ReturnType<typeof createTrackingStore>;
