import type { Interval } from "@careeros/shared";
import { describe, expect, it, vi } from "vitest";
import { createLogger } from "../../lib/log";
import { SYNC_STATE_KEY, type SyncState } from "../../lib/sync-state";
import { fakeStorage } from "../../test/fakes";
import { createAccountEpoch } from "../account-epoch";
import { DEFERRED_KEY, OUTBOX_KEY, QUARANTINE_KEY } from "../tracking/keys";
import { createOutbox } from "../tracking/outbox";
import { classify, parseDateHeader } from "./supabase-ingest";
import { createSyncService, INGEST_TIMEOUT_MS, type IngestResult } from "./sync-service";

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
  responses: (IngestResult | ((batch: Interval[]) => IngestResult | Promise<IngestResult>))[],
  pending: Interval[],
  options: { connected?: boolean } = {},
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
    isConnected: async () => options.connected ?? true,
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

describe("sync cycle across a change of account (#113)", () => {
  function epochSetup(ingest: () => Promise<IngestResult>) {
    const pending = [interval(), interval()];
    const storage = fakeStorage({ [OUTBOX_KEY]: pending });
    const epoch = createAccountEpoch();
    const outbox = createOutbox({
      area: storage,
      exclusive: (t) => t(),
      now: () => NOW,
      startOfLocalDay: (t) => t - (t % 86_400_000),
    });
    const sync = createSyncService({
      outbox,
      storage,
      now: () => NOW,
      sessionRejected: async () => epoch.bump(),
      ingest,
      epoch,
      isConnected: async () => true,
    });
    return { sync, storage, epoch, pending };
  }

  it("#113 local data cleared while waiting for a token: the old sync status is not written back", async () => {
    const s = epochSetup(async () => ({ ok: true, confirmedIds: [] }));
    const outcome = await s.sync.run(async () => {
      s.epoch.bump();
      s.storage.data.clear(); // what Forget local data does meanwhile
      return null;
    });
    expect(outcome).toBe("not-connected");
    expect(s.storage.data.has(SYNC_STATE_KEY)).toBe(false);
  });

  it("#113 cleared while a batch was in flight: nothing is settled or quarantined", async () => {
    const s = epochSetup(async () => {
      s.epoch.bump();
      s.storage.data.clear();
      return { ok: true, confirmedIds: [] };
    });
    expect(await s.sync.run(token)).toBe("not-connected");
    expect([...s.storage.data.keys()]).toEqual([]);
  });

  it("AUTH-11a not connected with nothing to upload: no sync status appears", async () => {
    const storage = fakeStorage();
    const sync = createSyncService({
      outbox: createOutbox({
        area: storage,
        exclusive: (t) => t(),
        now: () => NOW,
        startOfLocalDay: (t) => t - (t % 86_400_000),
      }),
      storage,
      now: () => NOW,
      sessionRejected: async () => {},
      ingest: async () => ({ ok: true, confirmedIds: [] }),
      isConnected: async () => false,
    });
    // No token is even asked for: a storage check, so an offline Disconnect never waits.
    expect(
      await sync.run(async () => {
        throw new Error("no token needed");
      }),
    ).toBe("not-connected");
    expect(storage.data.has(SYNC_STATE_KEY)).toBe(false);
  });

  it("SYNC-06 AUTH-11 a rejected session still records not-connected before the epoch moves", async () => {
    const s = epochSetup(async () => ({ ok: false, kind: "auth" }));
    expect(await s.sync.run(token)).toBe("not-connected");
    expect((s.storage.data.get(SYNC_STATE_KEY) as SyncState).lastOutcome).toBe("not-connected");
    expect(s.storage.data.get(OUTBOX_KEY)).toEqual(s.pending);
  });
});

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
    expect(s.state()).toMatchObject({
      failures: 1,
      notBefore: NOW + 60_000,
      lastOutcome: "offline",
    });
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
    expect(s.state()).toMatchObject({ notBefore: NOW + 3600_000, lastOutcome: "abuse" });
    expect(s.storage.data.get(OUTBOX_KEY)).toEqual([item]);
  });

  it("SYNC-06 a malformed call waits an hour and shows a sync error", async () => {
    const s = setup([{ ok: false, kind: "client" }], [interval()]);
    expect(await s.sync.run(token)).toBe("failed");
    expect(s.state()).toMatchObject({ notBefore: NOW + 3600_000, lastOutcome: "error" });
  });

  it("SYNC-06 AUTH-11 an auth failure marks the session rejected and keeps the data", async () => {
    const item = interval();
    const s = setup([{ ok: false, kind: "auth" }], [item]);
    expect(await s.sync.run(token)).toBe("not-connected");
    expect(s.rejected()).toBe(1);
    expect(s.storage.data.get(OUTBOX_KEY)).toEqual([item]);
  });

  it("AUTH-11 an expired token (device clock behind) is refreshed and retried — never a sign-out", async () => {
    const item = interval();
    const s = setup([{ ok: false, kind: "expired" }], [item]);
    const calls: (boolean | undefined)[] = [];
    const provider = async (o?: { forceRefresh?: boolean }) => {
      calls.push(o?.forceRefresh);
      return "token";
    };
    expect(await s.sync.run(provider)).toBe("done");
    expect(calls).toEqual([undefined, true]);
    expect(s.rejected()).toBe(0);
    expect(s.storage.data.get(OUTBOX_KEY)).toEqual([]);
  });

  it("not connected: nothing is sent", async () => {
    const s = setup([], [interval()], { connected: false });
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
    expect(classify(401, "PGRST301", "JWT expired")).toBe("expired");
    expect(classify(403, "42501", "permission denied")).toBe("client");
    expect(classify(409, "23503", undefined)).toBe("auth"); // user gone (FK)
    expect(classify(429, "PT429", "ABUSE_LIMIT")).toBe("abuse");
    expect(classify(0, undefined, "fetch failed")).toBe("unavailable");
    expect(classify(503, undefined, undefined)).toBe("unavailable");
    expect(classify(429, undefined, undefined)).toBe("unavailable");
    expect(classify(400, "22023", "INVALID_BATCH")).toBe("client");
  });
});

/** An interval ending `endMs` (epoch ms), 10 minutes long. */
const endingAt = (endMs: number): Interval => {
  const iso = (t: number) => `${new Date(t).toISOString().slice(0, 19)}Z`;
  return { ...interval(), started_at: iso(endMs - 600_000), ended_at: iso(endMs) };
};

describe("sync hardening (#58, #83, #56)", () => {
  it("SYNC-02c the cycle marks when it starts uploading and clears the mark when it ends", async () => {
    const seen: (number | null)[] = [];
    const s = setup([], [interval()]);
    const sync = createSyncService({
      outbox: createOutbox({
        area: s.storage,
        exclusive: (t) => t(),
        now: () => NOW,
        startOfLocalDay: (t) => t - (t % 86_400_000),
      }),
      storage: s.storage,
      now: () => NOW,
      sessionRejected: async () => {},
      isConnected: async () => true,
      ingest: async (batch) => {
        seen.push((s.storage.data.get(SYNC_STATE_KEY) as SyncState).syncingSince);
        return { ok: true, confirmedIds: batch.map((i) => i.id) };
      },
    });
    expect(await sync.run(token)).toBe("done");
    expect(seen).toEqual([NOW]);
    expect(s.state()?.syncingSince).toBeNull();
  });

  it("SYNC-02c nothing to upload: no syncing mark is written", async () => {
    const s = setup([], []);
    const writes: unknown[] = [];
    const set = s.storage.set.bind(s.storage);
    s.storage.set = async (items) => {
      if (SYNC_STATE_KEY in items) writes.push(items[SYNC_STATE_KEY]);
      await set(items);
    };
    await s.sync.run(token);
    expect(writes).toHaveLength(1);
    expect((writes[0] as SyncState).syncingSince).toBeNull();
  });

  it("SYNC-06a a stalled ingest call is abandoned after the timeout and backs off like a network error", async () => {
    vi.useFakeTimers();
    try {
      let aborted = false;
      const s = setup(
        [
          (_batch) =>
            new Promise<IngestResult>(() => {
              /* never answers */
            }),
        ],
        [interval()],
      );
      const storage = s.storage;
      const sync = createSyncService({
        outbox: createOutbox({
          area: storage,
          exclusive: (t) => t(),
          now: () => NOW,
          startOfLocalDay: (t) => t - (t % 86_400_000),
        }),
        storage,
        now: () => NOW,
        sessionRejected: async () => {},
        isConnected: async () => true,
        ingest: (_batch, _token, signal) =>
          new Promise<IngestResult>(() => {
            signal?.addEventListener("abort", () => {
              aborted = true;
            });
          }),
      });
      const run = sync.run(token);
      await vi.advanceTimersByTimeAsync(INGEST_TIMEOUT_MS);
      expect(await run).toBe("failed");
      expect(aborted).toBe(true);
      expect(s.state()).toMatchObject({ lastOutcome: "offline", failures: 1, syncingSince: null });
      // The guard is free again: the final sync of a Disconnect is not skipped.
      const again = sync.run(token, { force: true, ifIdle: true });
      await vi.advanceTimersByTimeAsync(INGEST_TIMEOUT_MS);
      expect(await again).toBe("failed");
    } finally {
      vi.useRealTimers();
    }
  });

  it("AUTH-10a no token while the session is still stored (refresh rate-limited): back off, still connected", async () => {
    const s = setup([], [interval()]);
    expect(await s.sync.run(async () => null)).toBe("failed");
    expect(s.state()).toMatchObject({ lastOutcome: "offline", failures: 1 });
    expect(s.rejected()).toBe(0);
  });

  it("SYNC-05a rejected for ending in the future: deferred until the server's clock passes the end, then retried", async () => {
    const skew = 20 * 60_000; // device clock 20 min ahead
    const serverNow = NOW - skew;
    const future = endingAt(NOW - 60_000); // ended 1 min ago locally, 19 min ahead of the server
    const fine = endingAt(NOW - 3 * 3600_000);
    const s = setup(
      [
        { ok: true, confirmedIds: [fine.id], serverNow },
        (batch) => ({ ok: true, confirmedIds: batch.map((i) => i.id), serverNow: NOW }),
      ],
      [fine, future],
    );
    expect(await s.sync.run(token)).toBe("done");
    expect(s.storage.data.get(QUARANTINE_KEY)).toEqual([]);
    expect(s.storage.data.get(DEFERRED_KEY)).toEqual([
      { interval: future, retryAt: NOW + (Date.parse(future.ended_at) - serverNow), attempts: 1 },
    ]);
    expect(s.state()?.clockAheadMs).toBe(skew);
    // Not due yet: nothing is sent.
    s.clock.now = NOW + 5 * 60_000;
    await s.sync.run(token);
    expect(s.batches).toHaveLength(1);
    // Due: sent again, accepted, and the hint goes away.
    s.clock.now = NOW + 20 * 60_000;
    expect(await s.sync.run(token)).toBe("done");
    expect(s.batches[1]).toEqual([future]);
    expect(s.storage.data.get(DEFERRED_KEY)).toEqual([]);
    expect(s.state()?.clockAheadMs).toBeNull();
  });

  it("SYNC-05a without the server's time, a rejection is quarantined as before", async () => {
    const future = endingAt(NOW - 60_000);
    const s = setup([{ ok: true, confirmedIds: [] }], [future]);
    expect(await s.sync.run(token)).toBe("done");
    expect(s.storage.data.get(QUARANTINE_KEY)).toEqual([future]);
  });

  it("SYNC-05b a multi-interval batch with nothing confirmed is a call error: nothing quarantined, then one-interval probe", async () => {
    const [a, b, c] = [interval(), interval(), interval()];
    const s = setup(
      [
        { ok: true, confirmedIds: [] },
        { ok: true, confirmedIds: [] }, // the probe: a really is rejected
      ],
      [a, b, c],
    );
    expect(await s.sync.run(token)).toBe("failed");
    expect(s.state()).toMatchObject({
      lastOutcome: "error",
      probeNext: true,
      notBefore: NOW + 3600_000,
    });
    expect(s.storage.data.get(QUARANTINE_KEY)).toEqual([]);
    expect(s.storage.data.get(OUTBOX_KEY)).toEqual([a, b, c]);
    s.clock.now = NOW + 3600_000;
    expect(await s.sync.run(token)).toBe("done");
    expect(s.batches.map((x) => x.length)).toEqual([3, 1, 2]);
    expect(s.storage.data.get(QUARANTINE_KEY)).toEqual([a]);
    expect(s.state()).toMatchObject({ lastOutcome: "ok", probeNext: false });
  });

  it("SYNC-05b a lone interval with nothing confirmed is a per-row rejection (quarantined)", async () => {
    const a = interval();
    const s = setup([{ ok: true, confirmedIds: [] }], [a]);
    expect(await s.sync.run(token)).toBe("done");
    expect(s.storage.data.get(QUARANTINE_KEY)).toEqual([a]);
  });

  it("TRK-17a a local store task that timed out ends the cycle without settling and clears the mark", async () => {
    const s = setup([], [interval()]);
    let calls = 0;
    const sync = createSyncService({
      outbox: createOutbox({
        area: s.storage,
        exclusive: async (t) => {
          calls += 1;
          if (calls === 3) throw new Error("tracker slot timed out"); // settle
          return t();
        },
        now: () => NOW,
        startOfLocalDay: (t) => t - (t % 86_400_000),
      }),
      storage: s.storage,
      now: () => NOW,
      sessionRejected: async () => {},
      isConnected: async () => true,
      ingest: async (batch) => ({ ok: true, confirmedIds: batch.map((i) => i.id) }),
    });
    expect(await sync.run(token)).toBe("failed");
    expect(s.state()?.syncingSince).toBeNull();
    expect((s.storage.data.get(OUTBOX_KEY) as Interval[]).length).toBe(1);
  });

  it("SYNC-02b waitIdle waits for the running cycle, but no longer than the bound", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const s = setup([], [interval()]);
    const first = s.sync.run(async () => {
      await gate;
      return "token";
    });
    let waited = false;
    const wait = s.sync.waitIdle(10_000).then((idle) => {
      waited = true;
      return idle;
    });
    await new Promise((r) => setTimeout(r, 5));
    expect(waited).toBe(false);
    release();
    expect(await wait).toBe(true);
    expect(await first).toBe("done");
    expect(await s.sync.waitIdle(10)).toBe(true); // nothing running

    vi.useFakeTimers();
    try {
      const hung = setup([], [interval()]);
      void hung.sync.run(() => new Promise(() => {}));
      const bounded = hung.sync.waitIdle(1000);
      await vi.advanceTimersByTimeAsync(1000);
      await expect(bounded).resolves.toBe(false); // still running → SYNC_IN_PROGRESS
    } finally {
      vi.useRealTimers();
    }
  });

  it("SYNC-05a the server's time comes from the HTTP Date header", () => {
    expect(parseDateHeader("Thu, 12 Nov 2026 10:00:00 GMT")).toBe(Date.UTC(2026, 10, 12, 10));
    expect(parseDateHeader(null)).toBeNull();
    expect(parseDateHeader("garbage")).toBeNull();
  });
});

describe("server time and skew (#150 review)", () => {
  it("SYNC-05a the latest measured skew is stored and decides when deferred intervals are due", async () => {
    const skew = 20 * 60_000;
    const future = endingAt(NOW - 60_000);
    const s = setup(
      [
        { ok: true, confirmedIds: [], serverNow: NOW - skew },
        // The user fixed the clock: the next response measures no skew.
        (batch) => ({ ok: true, confirmedIds: batch.map((i) => i.id), serverNow: s.clock.now }),
        (batch) => ({ ok: true, confirmedIds: batch.map((i) => i.id), serverNow: s.clock.now }),
      ],
      [future],
    );
    await s.sync.run(token);
    expect(s.state()?.serverSkewMs).toBe(skew);
    // 10 min later (real time) the clock is corrected; a new interval uploads and re-measures
    // the skew (0). The deferred one is not due yet: its end is still 9 min ahead.
    s.clock.now = NOW - 10 * 60_000;
    const fresh = endingAt(s.clock.now - 10_000);
    s.storage.data.set(OUTBOX_KEY, [fresh]);
    await s.sync.run(token);
    expect(s.state()?.serverSkewMs).toBe(0);
    expect(s.batches.at(-1)).toEqual([fresh]);
    // retryAt (old clock frame) is still ~39 min away, but the skew says the end has passed
    // on the server once local time reaches it.
    s.clock.now = Date.parse(future.ended_at);
    expect(await s.sync.run(token)).toBe("done");
    expect(s.batches.at(-1)).toEqual([future]);
    expect(s.storage.data.get(DEFERRED_KEY)).toEqual([]);
  });

  it("SYNC-05a without the server's time it logs once per cycle (no details)", async () => {
    const lines: string[] = [];
    const storage = fakeStorage({ [OUTBOX_KEY]: Array.from({ length: 250 }, interval) });
    const sync = createSyncService({
      outbox: createOutbox({
        area: storage,
        exclusive: (t) => t(),
        now: () => NOW,
        startOfLocalDay: (t) => t - (t % 86_400_000),
      }),
      storage,
      now: () => NOW,
      sessionRejected: async () => {},
      isConnected: async () => true,
      log: createLogger({ debug: false, sink: (_level, line) => lines.push(line) }),
      ingest: async (batch) => ({ ok: true, confirmedIds: batch.map((i) => i.id) }),
    });
    expect(await sync.run(token)).toBe("done"); // two batches
    expect(lines.filter((l) => l.includes("sync.server_time_unavailable"))).toHaveLength(1);
    expect(lines.join("\n")).not.toMatch(/leetcode|token|@/);
  });
});
