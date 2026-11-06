import type { Interval } from "@careeros/shared";
import { describe, expect, it } from "vitest";
import { fakeStorage } from "../../test/fakes";
import { OUTBOX_KEY, QUARANTINE_KEY } from "../tracking/keys";
import { createOutbox } from "../tracking/outbox";
import { classify } from "./supabase-ingest";
import {
  createSyncService,
  type IngestResult,
  SYNC_STATE_KEY,
  type SyncState,
} from "./sync-service";

const NOW = Date.UTC(2026, 10, 9, 15, 0, 0);
let n = 0;
const interval = (): Interval => ({
  id: `00000000-0000-4000-8000-${(++n).toString().padStart(12, "0")}`,
  device_id: "00000000-0000-4000-8000-00000000d001",
  domain: "leetcode.com",
  started_at: "2026-11-09T14:00:00Z",
  ended_at: "2026-11-09T14:10:00Z",
});

function setup(
  responses: (IngestResult | ((batch: Interval[]) => IngestResult))[],
  pending: Interval[],
) {
  const storage = fakeStorage({ [OUTBOX_KEY]: pending });
  const clock = { now: NOW };
  const outbox = createOutbox({
    area: storage,
    exclusive: (t) => t(),
    now: () => clock.now,
    startOfLocalDay: (t) => t - (t % 86_400_000),
  });
  const batches: Interval[][] = [];
  let rejected = 0;
  const sync = createSyncService({
    outbox,
    storage,
    now: () => clock.now,
    sessionRejected: async () => {
      rejected++;
    },
    ingest: async (batch) => {
      batches.push(batch);
      const next = responses.shift() ?? { ok: true, confirmedIds: batch.map((i) => i.id) };
      return typeof next === "function" ? next(batch) : next;
    },
  });
  const state = () => storage.data.get(SYNC_STATE_KEY) as SyncState | undefined;
  return { sync, storage, clock, batches, state, rejected: () => rejected };
}
const token = async () => "token";

describe("sync cycle (SYNC-02..06)", () => {
  it("SYNC-03 SYNC-04 uploads in batches of ≤ 200 until the outbox is empty", async () => {
    const items = Array.from({ length: 450 }, interval);
    const s = setup([], items);
    expect(await s.sync.run(token)).toBe("done");
    expect(s.batches.map((b) => b.length)).toEqual([200, 200, 50]);
    expect(s.storage.data.get(OUTBOX_KEY)).toEqual([]);
    expect(s.state()?.lastSyncedAt).toBe(NOW);
  });

  it("SYNC-05 ids the server does not confirm go to quarantine and the queue keeps moving", async () => {
    const [a, b] = [interval(), interval()];
    const s = setup([{ ok: true, confirmedIds: [a.id] }], [a, b]);
    expect(await s.sync.run(token)).toBe("done");
    expect(s.storage.data.get(QUARANTINE_KEY)).toEqual([b]);
  });

  it("SYNC-06 network/5xx/429 back off exponentially and keep the data; success resets", async () => {
    const item = interval();
    const s = setup(
      [
        { ok: false, kind: "unavailable" },
        { ok: false, kind: "unavailable" },
      ],
      [item],
    );
    expect(await s.sync.run(token)).toBe("failed");
    expect(s.state()).toMatchObject({ failures: 1, notBefore: NOW + 60_000 });
    expect(await s.sync.run(token)).toBe("skipped"); // still backing off
    s.clock.now = NOW + 60_000;
    expect(await s.sync.run(token)).toBe("failed");
    expect(s.state()).toMatchObject({ failures: 2, notBefore: s.clock.now + 2 * 60_000 });
    s.clock.now += 2 * 60_000;
    expect(await s.sync.run(token)).toBe("done");
    expect(s.state()).toMatchObject({ failures: 0, notBefore: 0 });
    expect(s.storage.data.get(OUTBOX_KEY)).toEqual([]);
  });

  it("SYNC-06 the abuse limit waits an hour without discarding anything", async () => {
    const item = interval();
    const s = setup([{ ok: false, kind: "abuse" }], [item]);
    expect(await s.sync.run(token)).toBe("failed");
    expect(s.state()).toMatchObject({ notBefore: NOW + 3600_000, lastError: null });
    expect(s.storage.data.get(OUTBOX_KEY)).toEqual([item]);
  });

  it("SYNC-06 a malformed call waits an hour and shows a sync error", async () => {
    const s = setup([{ ok: false, kind: "client" }], [interval()]);
    expect(await s.sync.run(token)).toBe("failed");
    expect(s.state()).toMatchObject({ notBefore: NOW + 3600_000, lastError: "SYNC_ERROR" });
  });

  it("SYNC-06 AUTH-11 an auth failure marks the session rejected and keeps the data", async () => {
    const item = interval();
    const s = setup([{ ok: false, kind: "auth" }], [item]);
    expect(await s.sync.run(token)).toBe("not-connected");
    expect(s.rejected()).toBe(1);
    expect(s.storage.data.get(OUTBOX_KEY)).toEqual([item]);
  });

  it("not connected: nothing is sent", async () => {
    const s = setup([], [interval()]);
    expect(await s.sync.run(async () => null)).toBe("not-connected");
    expect(s.batches).toEqual([]);
  });

  it("SYNC-02 one cycle at a time; the final sync ignores backoff and never waits", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const s = setup([], [interval()]);
    const slowToken = async () => {
      await gate;
      return "token";
    };
    const first = s.sync.run(slowToken);
    expect(await s.sync.run(token, { force: true, ifIdle: true })).toBe("skipped");
    release();
    expect(await first).toBe("done");

    const backingOff = setup([{ ok: false, kind: "unavailable" }], [interval()]);
    await backingOff.sync.run(token);
    expect(await backingOff.sync.run(token, { force: true })).toBe("done");
  });

  it("SYNC-06 error classification", () => {
    expect(classify(401, "PT401", undefined)).toBe("auth");
    expect(classify(409, "23503", undefined)).toBe("auth"); // user gone (FK)
    expect(classify(429, "PT429", "ABUSE_LIMIT")).toBe("abuse");
    expect(classify(0, undefined, "fetch failed")).toBe("unavailable");
    expect(classify(503, undefined, undefined)).toBe("unavailable");
    expect(classify(429, undefined, undefined)).toBe("unavailable");
    expect(classify(400, "22023", "INVALID_BATCH")).toBe("client");
  });
});
