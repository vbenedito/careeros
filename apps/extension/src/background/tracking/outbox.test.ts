import type { Interval } from "@careeros/shared";
import { describe, expect, it } from "vitest";
import { fakeStorage } from "../../test/fakes";
import { DROPPED_COUNT_KEY, OUTBOX_KEY, QUARANTINE_KEY, SYNCED_TODAY_KEY } from "./keys";
import { createOutbox } from "./outbox";

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
    expect(await outbox.counts()).toEqual({ pending: 0, quarantined: 1, dropped: 0 });
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
    expect(await outbox.counts()).toEqual({ pending: 1, quarantined: 0, dropped: 3 });
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
});
