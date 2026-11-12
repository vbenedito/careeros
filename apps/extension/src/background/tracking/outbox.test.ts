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
import { createOutbox, deferredDue, endedInServerFuture } from "./outbox";
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
    // Due by the measured skew (its end passed by the estimated server clock), yet rejected again.
    expect(await outbox.batch(200, -SKEW)).toEqual([future]);
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

describe("deferred retry timing (#150 review)", () => {
  const MIN = 60_000;
  const deferred = (endMs: number, retryAt: number) => ({
    interval: interval(endMs - 4 * MIN, 4),
    retryAt,
    attempts: 1,
  });

  it("SYNC-05a near the boundary (within CLOCK_SLACK_S) a rejection still counts as future-dated", () => {
    const server = NOW;
    const ending = (endMs: number) => interval(endMs - 4 * MIN, 4);
    // Beyond the 5-minute tolerance: future-dated.
    expect(endedInServerFuture(ending(server + 5 * MIN + 2_000), server)).toBe(true);
    // 3 s inside the tolerance, but within the 5 s slack: still treated as future-dated.
    expect(endedInServerFuture(ending(server + 5 * MIN - 3_000), server)).toBe(true);
    // Clearly inside: a real rejection.
    expect(endedInServerFuture(ending(server + 5 * MIN - 6_000), server)).toBe(false);
    expect(endedInServerFuture(ending(server), server)).toBe(false);
    const atBoundary = ending(server + 5 * MIN);
    expect(endedInServerFuture(atBoundary, null)).toBe(false);
  });

  it("SYNC-05a retryAt is capped at DEFERRED_RETRY_CAP_MIN", async () => {
    const far = interval(NOW - 4 * MIN, 4); // ends now locally
    const { area, outbox } = setup({ [OUTBOX_KEY]: [far] });
    await outbox.settle([far], [], NOW - 3 * 3600_000); // clock 3 h ahead
    const [entry] = area.data.get(DEFERRED_KEY) as { retryAt: number }[];
    expect(entry?.retryAt).toBe(NOW + 30 * MIN);
  });

  it("SYNC-05a due as soon as the latest measured skew says its end passed on the server", () => {
    const d = deferred(NOW - MIN, NOW + 19 * MIN);
    expect(deferredDue(d, NOW, 20 * MIN)).toBe(false); // server is at NOW − 20 min
    expect(deferredDue(d, NOW, 0)).toBe(true); // clock corrected: server time = local time
    expect(deferredDue(d, NOW, null)).toBe(false); // skew unknown: wait for retryAt
    expect(deferredDue(d, NOW + 19 * MIN, null)).toBe(true);
  });

  it("SYNC-05a a clock moved back never strands a deferred interval", () => {
    // Deferred under a clock 2 h ahead; the clock was then set back 2 h.
    const d = deferred(NOW + 2 * 3600_000, NOW + 2 * 3600_000 + 30 * MIN);
    expect(deferredDue(d, NOW, null)).toBe(true); // retryAt beyond the cap from now
  });

  it("SYNC-05a after a clock correction, intervals starting more than 30 days ahead are dropped", async () => {
    const future = interval(NOW + 40 * DAY);
    const soon = interval(NOW + 2 * 3600_000);
    const { area, outbox } = setup({
      [DEFERRED_KEY]: [
        { interval: future, retryAt: NOW, attempts: 1 },
        { interval: soon, retryAt: NOW, attempts: 1 },
      ],
      [QUARANTINE_KEY]: [future],
    });
    await outbox.prune();
    expect(
      (area.data.get(DEFERRED_KEY) as { interval: Interval }[]).map((d) => d.interval),
    ).toEqual([soon]);
    expect(area.data.get(QUARANTINE_KEY)).toEqual([]);
    expect(area.data.get(DROPPED_COUNT_KEY)).toBe(1);
  });

  it("SYNC-05a clock 2 h ahead: cap retries do not use up CLOCK_RETRY_MAX; uploaded once due (re-review of #150)", async () => {
    const AHEAD = 2 * 3600_000;
    const MIN = 60_000;
    const iv = interval(NOW - 5 * MIN, 4); // ended 1 min ago on the fast local clock
    const area = fakeStorage({ [OUTBOX_KEY]: [iv] });
    let now = NOW;
    const outbox = createOutbox({
      area,
      exclusive: (t) => t(),
      now: () => now,
      startOfLocalDay: (t) => t - (t % DAY),
    });
    const server = () => now - AHEAD;
    // The fake server: accepts once its clock is within the 5-minute tolerance of ended_at.
    const upload = async () => {
      const batch = await outbox.batch(200, AHEAD);
      const accepted = batch.filter((i) => Date.parse(i.ended_at) <= server() + 5 * MIN);
      if (batch.length > 0)
        await outbox.settle(
          batch,
          accepted.map((i) => i.id),
          server(),
        );
      return batch;
    };
    expect(await upload()).toEqual([iv]); // first rejection: deferred
    const sent: number[] = [];
    for (let t = 5; t <= 130; t += 5) {
      now = NOW + t * MIN;
      if ((await upload()).length > 0) sent.push(t);
      expect(area.data.get(QUARANTINE_KEY) ?? []).toEqual([]);
      if (((area.data.get(SYNCED_TODAY_KEY) as Interval[] | undefined) ?? []).length > 0) break;
    }
    // Cap checks at +30/+60/+90 are rejected but not counted; at +120 (due by skew) it uploads.
    expect(sent).toEqual([30, 60, 90, 120]);
    expect(area.data.get(SYNCED_TODAY_KEY)).toEqual([iv]);
    expect(area.data.get(DEFERRED_KEY)).toEqual([]);
  });

  it("SYNC-05a with no skew known, cap retries still count, so they stay bounded", async () => {
    const iv = interval(NOW - 5 * 60_000, 4);
    const { area, outbox } = setup({
      [DEFERRED_KEY]: [{ interval: iv, retryAt: NOW, attempts: 3 }],
    });
    expect(await outbox.batch(200, null)).toEqual([iv]);
    await outbox.settle([iv], [], NOW - 2 * 3600_000);
    expect(area.data.get(QUARANTINE_KEY)).toEqual([iv]);
  });
});
