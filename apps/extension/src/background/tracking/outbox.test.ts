import type { Interval } from "@careeros/shared";
import { describe, expect, it } from "vitest";
import { fakeStorage } from "../../test/fakes";
import {
  DEFERRED_KEY,
  DROPPED_COUNT_KEY,
  OUTBOX_KEY,
  QUARANTINE_KEY,
  SYNCED_TODAY_KEY,
} from "./keys";
import { createOutbox } from "./outbox";
import { createSerialQueue } from "./queue";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 9, 15, 0, 0); // local day = UTC day in this test
let n = 0;
function interval(startMs: number, minutes = 10): Interval {
  const iso = (t: number) => `${new Date(t).toISOString().slice(0, 19)}Z`;
  return {
    id: `00000000-0000-4000-8000-${(++n).toString().padStart(12, "0")}`,
    device_id: "00000000-0000-4000-8000-00000000d001",
    domain: "leetcode.com",
    started_at: iso(startMs),
    ended_at: iso(startMs + minutes * 60_000),
  };
}

function setup(initial: Record<string, unknown> = {}) {
  const area = fakeStorage(initial);
  const outbox = createOutbox({
    area,
    exclusive: (task) => task(),
    now: () => NOW,
    startOfLocalDay: (t) => t - (t % DAY),
  });
  return { area, outbox };
}

describe("local store (SYNC-01, 05, 07, 08)", () => {
  it("SYNC-03 batches are the oldest intervals, at most the batch size", async () => {
    const items = [interval(NOW - 3000_000), interval(NOW - 2000_000), interval(NOW - 1000_000)];
    const { outbox } = setup({ [OUTBOX_KEY]: items });
    expect(await outbox.batch(2)).toEqual(items.slice(0, 2));
  });

  it("SYNC-01 SYNC-04 SYNC-08 confirmed intervals leave the outbox; today's are kept for the popup", async () => {
    const yesterday = interval(NOW - DAY);
    const today = interval(NOW - 3600_000);
    const later = interval(NOW - 60_000);
    const { area, outbox } = setup({ [OUTBOX_KEY]: [yesterday, today, later] });
    await outbox.settle([yesterday, today], [yesterday.id, today.id]);
    expect(area.data.get(OUTBOX_KEY)).toEqual([later]);
    expect(area.data.get(SYNCED_TODAY_KEY)).toEqual([today]);
    expect(await outbox.today()).toEqual([today, later]);
  });

  it("SYNC-05 sent intervals the server did not confirm go to quarantine and are not retried", async () => {
    const good = interval(NOW - 3600_000);
    const bad = interval(NOW - 1800_000);
    const { area, outbox } = setup({ [OUTBOX_KEY]: [good, bad] });
    await outbox.settle([good, bad], [good.id]);
    expect(area.data.get(QUARANTINE_KEY)).toEqual([bad]);
    expect(await outbox.batch()).toEqual([]);
    expect(await outbox.counts()).toEqual({ pending: 0, deferred: 0, quarantined: 1, dropped: 0 });
  });

  it("SYNC-01 intervals appended after the batch was taken are never lost", async () => {
    const sent = interval(NOW - 3600_000);
    const appended = interval(NOW - 60_000);
    const { area, outbox } = setup({ [OUTBOX_KEY]: [sent] });
    const batch = await outbox.batch();
    area.data.set(OUTBOX_KEY, [sent, appended]); // the engine closed another interval meanwhile
    await outbox.settle(batch, [sent.id]);
    expect(area.data.get(OUTBOX_KEY)).toEqual([appended]);
  });

  it("SYNC-07 SYNC-08 prune drops too-old pending intervals (counted) and synced ones of past days", async () => {
    const tooOld = interval(NOW - 31 * DAY);
    const old = interval(NOW - 29 * DAY);
    const syncedYesterday = interval(NOW - DAY);
    const syncedToday = interval(NOW - 3600_000);
    const { area, outbox } = setup({
      [OUTBOX_KEY]: [tooOld, old],
      [SYNCED_TODAY_KEY]: [syncedYesterday, syncedToday],
      [DROPPED_COUNT_KEY]: 2,
    });
    await outbox.prune();
    expect(area.data.get(OUTBOX_KEY)).toEqual([old]);
    expect(area.data.get(SYNCED_TODAY_KEY)).toEqual([syncedToday]);
    expect(await outbox.counts()).toEqual({ pending: 1, deferred: 0, quarantined: 0, dropped: 3 });
  });

  it("AUTH-12 clear removes outbox, quarantine, today cache and counters", async () => {
    const { area, outbox } = setup({
      [OUTBOX_KEY]: [interval(NOW)],
      [QUARANTINE_KEY]: [],
      [SYNCED_TODAY_KEY]: [],
      [DROPPED_COUNT_KEY]: 1,
    });
    await outbox.clear();
    expect(area.data.size).toBe(0);
  });

  it("SYNC-01 with the real serialized queue, engine appends and settle interleave without loss", async () => {
    const area = fakeStorage();
    const enqueue = createSerialQueue();
    const outbox = createOutbox({
      area,
      exclusive: enqueue,
      now: () => NOW,
      startOfLocalDay: (t) => t - (t % DAY),
    });
    const first = interval(NOW - 3600_000);
    const append = (i: Interval) =>
      enqueue(async () => {
        const current = ((await area.get(OUTBOX_KEY))[OUTBOX_KEY] as Interval[] | undefined) ?? [];
        await area.set({ [OUTBOX_KEY]: [...current, i] });
      });
    await append(first);
    const batch = await outbox.batch();
    const second = interval(NOW - 60_000);
    await Promise.all([append(second), outbox.settle(batch, [first.id])]);
    expect(area.data.get(OUTBOX_KEY)).toEqual([second]);
    expect(await outbox.today()).toEqual([first, second]);
  });
});

describe("deferred intervals and unreadable entries (#58, #83, #56)", () => {
  const SKEW = 20 * 60_000; // device clock 20 min ahead of the server

  it("SYNC-05a only rejections ending beyond the server's tolerance are deferred; others are quarantined", async () => {
    const future = interval(NOW - 5 * 60_000, 4); // ends 1 min ago locally = 19 min ahead of the server
    const past = interval(NOW - 3 * 3600_000);
    const { area, outbox } = setup({ [OUTBOX_KEY]: [past, future] });
    expect(await outbox.settle([past, future], [], NOW - SKEW)).toEqual({
      deferred: 1,
      quarantined: 1,
    });
    expect(area.data.get(QUARANTINE_KEY)).toEqual([past]);
    expect(area.data.get(DEFERRED_KEY)).toEqual([
      { interval: future, retryAt: NOW + 19 * 60_000, attempts: 1 },
    ]);
    expect(area.data.get(OUTBOX_KEY)).toEqual([]);
    expect(await outbox.counts()).toEqual({ pending: 0, deferred: 1, quarantined: 1, dropped: 0 });
    // Deferred time still counts as today's time on this device (SYNC-12).
    expect(await outbox.today()).toEqual([future]);
  });

  it("SYNC-05a deferred intervals come first in a batch once due, never before", async () => {
    const future = interval(NOW - 5 * 60_000, 4);
    const queued = interval(NOW - 60_000, 0.5);
    const { outbox } = setup({
      [OUTBOX_KEY]: [queued],
      [DEFERRED_KEY]: [{ interval: future, retryAt: NOW + 1, attempts: 1 }],
    });
    expect(await outbox.batch()).toEqual([queued]);
    const due = setup({
      [OUTBOX_KEY]: [queued],
      [DEFERRED_KEY]: [{ interval: future, retryAt: NOW, attempts: 1 }],
    });
    expect(await due.outbox.batch()).toEqual([future, queued]);
  });

  it("SYNC-05a after CLOCK_RETRY_MAX future rejections the interval goes to quarantine", async () => {
    const future = interval(NOW - 5 * 60_000, 4);
    const { area, outbox } = setup({
      [DEFERRED_KEY]: [{ interval: future, retryAt: NOW, attempts: 3 }],
    });
    expect(await outbox.settle([future], [], NOW - SKEW)).toEqual({ deferred: 0, quarantined: 1 });
    expect(area.data.get(QUARANTINE_KEY)).toEqual([future]);
    expect(area.data.get(DEFERRED_KEY)).toEqual([]);
  });

  it("SYNC-05a a retried interval rejected for another reason is quarantined; a confirmed one is synced", async () => {
    const a = interval(NOW - 7200_000);
    const b = interval(NOW - 3600_000);
    const { area, outbox } = setup({
      [DEFERRED_KEY]: [
        { interval: a, retryAt: NOW, attempts: 1 },
        { interval: b, retryAt: NOW, attempts: 2 },
      ],
    });
    await outbox.settle([a, b], [b.id], NOW);
    expect(area.data.get(QUARANTINE_KEY)).toEqual([a]);
    expect(area.data.get(SYNCED_TODAY_KEY)).toEqual([b]);
    expect(area.data.get(DEFERRED_KEY)).toEqual([]);
  });

  it("SYNC-07 deferred intervals older than 30 days are dropped and counted", async () => {
    const old = interval(NOW - 31 * DAY);
    const { area, outbox } = setup({
      [DEFERRED_KEY]: [{ interval: old, retryAt: NOW + 1000, attempts: 1 }],
    });
    await outbox.prune();
    expect(area.data.get(DEFERRED_KEY)).toEqual([]);
    expect(area.data.get(DROPPED_COUNT_KEY)).toBe(1);
  });

  it("SYNC-07a entries dropped as unreadable are counted in `dropped`", async () => {
    const ok = interval(NOW - 3600_000);
    const { area, outbox } = setup({
      [OUTBOX_KEY]: [ok, { id: "not-an-interval" }, 42],
      [DEFERRED_KEY]: [{ interval: { id: "x" }, retryAt: 1, attempts: 1 }],
      [DROPPED_COUNT_KEY]: 1,
    });
    expect((await outbox.counts()).dropped).toBe(4);
    await outbox.prune();
    expect(area.data.get(OUTBOX_KEY)).toEqual([ok]);
    expect(area.data.get(DROPPED_COUNT_KEY)).toBe(4);
    // Counted once: the entries are gone now.
    await outbox.prune();
    expect(area.data.get(DROPPED_COUNT_KEY)).toBe(4);
  });

  it("TRK-17a a task whose slot timed out writes nothing", async () => {
    const area = fakeStorage({ [OUTBOX_KEY]: [interval(NOW - 3600_000)] });
    const before = structuredClone(Object.fromEntries(area.data));
    const outbox = createOutbox({
      area,
      exclusive: (task) => task({ stale: () => true }),
      now: () => NOW,
      startOfLocalDay: (t) => t - (t % DAY),
    });
    const [only] = await outbox.batch();
    await outbox.settle([only as Interval], [(only as Interval).id]);
    await outbox.prune();
    expect(Object.fromEntries(area.data)).toEqual(before);
  });

  it("AUTH-12 clear also removes deferred intervals", async () => {
    const { area, outbox } = setup({
      [DEFERRED_KEY]: [{ interval: interval(NOW), retryAt: NOW, attempts: 1 }],
    });
    await outbox.clear();
    expect(area.data.has(DEFERRED_KEY)).toBe(false);
  });
});
