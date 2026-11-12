import type { Interval } from "@careeros/shared";
import { describe, expect, it } from "vitest";
import { fakeBackend, fakeLocalData, fakeStorage, session } from "../../test/fakes";
import { createAccountEpoch } from "../account-epoch";
import { createSyncService, type IngestResult } from "../sync/sync-service";
import { DOMAINS_CACHE_KEY, OUTBOX_KEY } from "../tracking/keys";
import { createOutbox } from "../tracking/outbox";
import { createAuthService, REFRESH_MARGIN_S } from "./auth-service";
import { DATA_OWNER_KEY, NEEDS_RECONNECT_KEY } from "./storage";

const NOW_MS = 1_800_000_000_000;
const nowS = NOW_MS / 1000;

function setup(
  options: { pending?: number; afterFlush?: number; storage?: Record<string, unknown> } = {},
) {
  const fb = fakeBackend({ "token-alice": session("alice"), "token-bob": session("bob") });
  const storage = fakeStorage(options.storage);
  const ld = fakeLocalData(options.pending ?? 0, options.afterFlush ?? options.pending ?? 0);
  const epoch = createAccountEpoch();
  const auth = createAuthService({
    backend: fb.backend,
    storage,
    localData: ld.localData,
    now: () => NOW_MS,
    epoch,
  });
  return { auth, fb, storage, ld, epoch };
}

describe("connect", () => {
  it("adopts the new session and records the data owner", async () => {
    const { auth, fb, storage } = setup({ storage: { [NEEDS_RECONNECT_KEY]: true } });
    expect(await auth.connect("token-alice")).toEqual({ ok: true, email: "alice@example.test" });
    expect(fb.calls).toEqual(["verify", "adopt"]);
    expect(storage.data.get(DATA_OWNER_KEY)).toBe("alice");
    expect(storage.data.has(NEEDS_RECONNECT_KEY)).toBe(false);
    expect((await auth.status()).connected).toBe(true);
  });

  it("AUTH-09 an invalid or used token is rejected", async () => {
    const { auth, fb } = setup();
    expect(await auth.connect("token-unknown")).toEqual({ ok: false, code: "INVALID_TOKEN" });
    expect(fb.calls).toEqual(["verify"]);
  });

  it("AUTH-07b same user while connected: success without replacing the session", async () => {
    const { auth, fb } = setup();
    fb.setCurrent(session("alice"));
    expect(await auth.connect("token-alice")).toEqual({ ok: true, email: "alice@example.test" });
    expect(fb.calls).toEqual(["verify", "discard"]);
  });

  it("AUTH-07b different user while connected: ALREADY_CONNECTED, new session revoked", async () => {
    const { auth, fb } = setup();
    fb.setCurrent(session("alice"));
    expect(await auth.connect("token-bob")).toEqual({ ok: false, code: "ALREADY_CONNECTED" });
    expect(fb.calls).toEqual(["verify", "discard"]);
    expect((await fb.backend.currentSession())?.userId).toBe("alice");
  });

  it("AUTH-11 same user reconnecting keeps pending intervals", async () => {
    const { auth, ld } = setup({ pending: 3, storage: { [DATA_OWNER_KEY]: "alice" } });
    expect((await auth.connect("token-alice")).ok).toBe(true);
    expect(ld.state.cleared).toBe(0);
  });

  it("AUTH-11 another user's pending intervals block the connection until discarded", async () => {
    const { auth, fb, ld, storage } = setup({ pending: 3, storage: { [DATA_OWNER_KEY]: "alice" } });
    expect(await auth.connect("token-bob")).toEqual({ ok: false, code: "UNSYNCED_DATA" });
    expect(fb.calls).toEqual(["verify", "discard"]);
    expect(ld.state.cleared).toBe(0);

    expect((await auth.connect("token-bob", { discardOtherUsersData: true })).ok).toBe(true);
    expect(ld.state.cleared).toBe(1);
    expect(storage.data.get(DATA_OWNER_KEY)).toBe("bob");
  });
});

describe("connect: another user's local data", () => {
  it("AUTH-11 SEC-01 synced data of the previous user is cleared before another user connects", async () => {
    const { auth, ld, storage } = setup({ pending: 0, storage: { [DATA_OWNER_KEY]: "alice" } });
    expect((await auth.connect("token-bob")).ok).toBe(true);
    expect(ld.state.cleared).toBe(1);
    expect(storage.data.get(DATA_OWNER_KEY)).toBe("bob");
  });
});

describe("forget local data (#113, AUTH-11a)", () => {
  it("#113 adopting a session and invalidating one start a new account epoch", async () => {
    const { auth, epoch } = setup();
    await auth.connect("token-alice");
    expect(epoch.current()).toBe(1);
    await auth.sessionRejected();
    expect(epoch.current()).toBe(2);
  });

  it("AUTH-11a while disconnected, everything the last account left is deleted", async () => {
    const { auth, ld, storage } = setup({
      pending: 3,
      storage: { [DATA_OWNER_KEY]: "alice", [NEEDS_RECONNECT_KEY]: true },
    });
    expect(await auth.forgetLocalData()).toEqual({ ok: true });
    expect(ld.state.cleared).toBe(1);
    expect(storage.data.has(DATA_OWNER_KEY)).toBe(false);
    expect(storage.data.has(NEEDS_RECONNECT_KEY)).toBe(false);
    // Afterwards another account connects without UNSYNCED_DATA.
    expect((await auth.connect("token-bob")).ok).toBe(true);
  });

  it("AUTH-11a refused while connected: Disconnect is the way", async () => {
    const { auth, fb, ld } = setup({ pending: 3 });
    fb.setCurrent(session("alice"));
    expect(await auth.forgetLocalData()).toEqual({ ok: false, code: "CONNECTED" });
    expect(ld.state.cleared).toBe(0);
  });
});

describe("connect failures", () => {
  it("revokes the verified session when it cannot be adopted", async () => {
    const { auth, fb } = setup();
    fb.backend.adoptSession = async () => {
      throw new Error("storage full");
    };
    await expect(auth.connect("token-alice")).rejects.toThrow("storage full");
    expect(fb.calls).toEqual(["verify", "discard"]);
  });
});

describe("accessToken", () => {
  it("returns null when not connected", async () => {
    expect(await setup().auth.accessToken()).toBeNull();
  });

  it("AUTH-10 uses the stored token while it is valid for more than 60 s", async () => {
    const { auth, fb } = setup();
    fb.setCurrent(session("alice", { expiresAt: nowS + REFRESH_MARGIN_S + 1 }));
    expect(await auth.accessToken()).toBe("access-alice");
    expect(fb.calls).not.toContain("refresh");
  });

  it("AUTH-10 refreshes when the token expires within 60 s", async () => {
    const { auth, fb } = setup();
    fb.setCurrent(session("alice", { expiresAt: nowS + 30 }));
    fb.willRefresh({
      ok: true,
      session: session("alice", { accessToken: "fresh", expiresAt: nowS + 3600 }),
    });
    expect(await auth.accessToken()).toBe("fresh");
  });

  it("AUTH-10 concurrent callers trigger a single refresh", async () => {
    const { auth, fb } = setup();
    fb.setCurrent(session("alice", { expiresAt: nowS + 10 }));
    fb.willRefresh({
      ok: true,
      session: session("alice", { accessToken: "fresh", expiresAt: nowS + 3600 }),
    });
    const tokens = await Promise.all([auth.accessToken(), auth.accessToken(), auth.accessToken()]);
    expect(tokens).toEqual(["fresh", "fresh", "fresh"]);
    expect(fb.calls.filter((c) => c === "refresh")).toHaveLength(1);
  });

  it("AUTH-11 an invalid refresh clears the session, keeps data and asks to reconnect", async () => {
    const { auth, fb, ld, storage } = setup({
      pending: 2,
      storage: { [DOMAINS_CACHE_KEY]: { domains: ["leetcode.com"] } },
    });
    fb.setCurrent(session("alice", { expiresAt: nowS - 5 }));
    fb.willRefresh({ ok: false, reason: "invalid" });
    expect(await auth.accessToken()).toBeNull();
    expect(fb.calls).toContain("clearSession");
    expect(storage.data.get(NEEDS_RECONNECT_KEY)).toBe(true);
    expect(ld.state.cleared).toBe(0);
    // #113: the account's site list does not stay on a shared profile; it reloads on reconnect.
    expect(storage.data.has(DOMAINS_CACHE_KEY)).toBe(false);
    expect(await auth.status()).toEqual({ connected: false, email: null, needsReconnect: true });
  });

  it("a temporary failure (offline) keeps the session", async () => {
    const { auth, fb, storage } = setup();
    fb.setCurrent(session("alice", { expiresAt: nowS - 5 }));
    fb.willRefresh({ ok: false, reason: "unavailable" });
    expect(await auth.accessToken()).toBeNull();
    expect((await auth.status()).connected).toBe(true);
    expect(storage.data.has(NEEDS_RECONNECT_KEY)).toBe(false);
  });
});

describe("sessionRejected", () => {
  it("AUTH-11 an API 401 / deleted user marks the session invalid", async () => {
    const { auth, fb } = setup();
    fb.setCurrent(session("alice"));
    await auth.sessionRejected();
    expect(await auth.status()).toEqual({ connected: false, email: null, needsReconnect: true });
  });
});

describe("disconnect", () => {
  it("AUTH-12 refuses while intervals remain unsynced after a final sync", async () => {
    const setupResult = setup({ pending: 4, afterFlush: 1 });
    const { auth, fb } = setupResult;
    fb.setCurrent(session("alice"));
    const ld = setupResult.ld;
    expect(await auth.disconnect()).toEqual({
      ok: false,
      code: "UNSYNCED_DATA",
      unsynced: 1,
      quarantined: 0,
    });
    expect(fb.calls).not.toContain("signOut");
    // Tracking was stopped before the final sync and resumed after the refusal.
    expect(ld.state.calls).toEqual(["stop", "flush", "resume"]);
  });

  it("AUTH-12 a failure while stopping tracking resumes it and propagates", async () => {
    const { auth, fb, ld } = setup({ pending: 0 });
    fb.setCurrent(session("alice"));
    ld.localData.stopTracking = async () => {
      ld.state.calls.push("stop");
      throw new Error("storage full");
    };
    await expect(auth.disconnect()).rejects.toThrow("storage full");
    expect(ld.state.calls).toEqual(["stop", "resume"]);
    expect(fb.calls).not.toContain("signOut");
  });

  it("AUTH-12 the open interval is closed into the outbox before the final sync", async () => {
    const { auth, fb, ld } = setup({ pending: 0, afterFlush: 0 });
    fb.setCurrent(session("alice"));
    expect(await auth.disconnect()).toEqual({ ok: true });
    expect(ld.state.calls).toEqual(["stop", "flush"]);
  });

  it("AUTH-12 signs out locally and clears local data once everything is synced", async () => {
    const { auth, fb, ld, storage } = setup({
      pending: 4,
      afterFlush: 0,
      storage: { [DATA_OWNER_KEY]: "alice", [NEEDS_RECONNECT_KEY]: true },
    });
    fb.setCurrent(session("alice"));
    expect(await auth.disconnect()).toEqual({ ok: true });
    expect(fb.calls).toContain("signOut");
    expect(ld.state.cleared).toBe(1);
    expect(storage.data.size).toBe(0);
  });

  it("AUTH-12 the popup can confirm discarding unsynced intervals", async () => {
    const { auth, fb, ld } = setup({ pending: 2 });
    fb.setCurrent(session("alice"));
    expect(await auth.disconnect({ discardUnsynced: true })).toEqual({ ok: true });
    expect(fb.calls).toContain("signOut");
    expect(ld.state.cleared).toBe(1);
  });
});

describe("disconnect hardening (#58, #65)", () => {
  it("SYNC-02b waits for a running upload before taking the lock, then runs the final sync", async () => {
    const { auth, fb, ld } = setup({ pending: 0 });
    fb.setCurrent(session("alice"));
    ld.localData.waitForUpload = async () => {
      ld.state.calls.push("wait");
      return true;
    };
    expect(await auth.disconnect()).toEqual({ ok: true });
    expect(ld.state.calls).toEqual(["wait", "stop", "flush"]);
  });

  it("SYNC-02b the wait happens outside the lock: a cycle waiting for a token can finish", async () => {
    const { auth, fb, ld } = setup({ pending: 0 });
    fb.setCurrent(session("alice"));
    let cycle: Promise<string | null> = Promise.resolve(null);
    ld.localData.waitForUpload = async () => {
      // The running cycle asks for a token while Disconnect waits for it.
      cycle = auth.accessToken();
      await cycle;
      return true;
    };
    expect(await auth.disconnect()).toEqual({ ok: true });
    expect(await cycle).toBe("access-alice");
  });

  it("#65 the popup's Disconnect also asks before deleting quarantined intervals; the dashboard's does not", async () => {
    const { auth, fb, ld } = setup({ pending: 0 });
    fb.setCurrent(session("alice"));
    ld.localData.quarantinedCount = async () => 2;
    expect(await auth.disconnect({ includeQuarantined: true })).toEqual({
      ok: false,
      code: "UNSYNCED_DATA",
      unsynced: 0,
      quarantined: 2,
    });
    expect(await auth.disconnect()).toEqual({ ok: true });
  });

  it("SYNC-09a another user connecting never sees the previous user's cached sites", async () => {
    const { auth, storage } = setup({
      storage: { [DATA_OWNER_KEY]: "alice", [DOMAINS_CACHE_KEY]: { domains: ["alice.dev"] } },
    });
    expect(await auth.connect("token-bob")).toMatchObject({ ok: true });
    expect(storage.data.has(DOMAINS_CACHE_KEY)).toBe(false);
    // Also without a recorded owner (e.g. an older install).
    const other = setup({ storage: { [DOMAINS_CACHE_KEY]: { domains: ["old.dev"] } } });
    expect(await other.auth.connect("token-alice")).toMatchObject({ ok: true });
    expect(other.storage.data.has(DOMAINS_CACHE_KEY)).toBe(false);
  });
});

describe("Disconnect while an upload is still running (#150 review, AUTH-12b)", () => {
  it("AUTH-12b still running after the wait: SYNC_IN_PROGRESS, nothing stopped or signed out", async () => {
    const { auth, fb, ld } = setup({ pending: 3 });
    fb.setCurrent(session("alice"));
    ld.localData.waitForUpload = async () => false;
    expect(await auth.disconnect({ includeQuarantined: true })).toEqual({
      ok: false,
      code: "SYNC_IN_PROGRESS",
    });
    expect(ld.state.calls).toEqual([]);
    expect(fb.calls).not.toContain("signOut");
  });

  it("AUTH-12b a confirmed discard does not wait for the upload", async () => {
    const { auth, fb, ld } = setup({ pending: 3 });
    fb.setCurrent(session("alice"));
    ld.localData.waitForUpload = async () => false;
    expect(await auth.disconnect({ discardUnsynced: true })).toEqual({ ok: true });
    expect(fb.calls).toContain("signOut");
  });
});

/** Interval timestamps without milliseconds, as the engine writes them. */
const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");

describe("Disconnect racing a sync alarm (grill E2)", () => {
  it("AUTH-12c a cycle that starts between the wait and the lock: SYNC_IN_PROGRESS, then the upload completes", async () => {
    const interval: Interval = {
      id: "00000000-0000-4000-8000-000000000001",
      device_id: "00000000-0000-4000-8000-00000000d001",
      domain: "leetcode.com",
      started_at: iso(NOW_MS - 20 * 60_000),
      ended_at: iso(NOW_MS - 10 * 60_000),
    };
    const fb = fakeBackend();
    fb.setCurrent(session("alice"));
    const storage = fakeStorage({ [OUTBOX_KEY]: [interval] });
    const outbox = createOutbox({
      area: storage,
      exclusive: (t) => t(),
      now: () => NOW_MS,
      startOfLocalDay: (t) => t - (t % 86_400_000),
    });
    const uploaded: string[] = [];
    const sync = createSyncService({
      outbox,
      storage,
      now: () => NOW_MS,
      sessionRejected: async () => undefined,
      isConnected: async () => (await fb.backend.currentSession()) !== null,
      ingest: async (batch): Promise<IngestResult> => {
        uploaded.push(...batch.map((i) => i.id));
        return { ok: true, confirmedIds: batch.map((i) => i.id) };
      },
    });
    const pendingCount = async () => {
      const counts = await outbox.counts();
      return counts.pending + counts.deferred;
    };
    let alarmCycle: Promise<unknown> = Promise.resolve();
    const auth = createAuthService({
      backend: fb.backend,
      storage,
      now: () => NOW_MS,
      localData: {
        // Idle when Disconnect checks; the alarm fires right after, before Disconnect takes
        // the lock. Its cycle then waits for that lock to get a token.
        waitForUpload: async () => {
          const idle = await sync.waitIdle(1000);
          alarmCycle = sync.run(() => auth.accessToken());
          return idle;
        },
        flush: async (accessToken) => {
          const outcome = await sync.run(accessToken, { force: true, ifIdle: true });
          return { remaining: await pendingCount(), skipped: outcome === "skipped" };
        },
        pendingCount,
        quarantinedCount: async () => 0,
        clear: async () => undefined,
        stopTracking: async () => undefined,
        resumeTracking: async () => undefined,
      },
    });

    expect(await auth.disconnect({ includeQuarantined: true })).toEqual({
      ok: false,
      code: "SYNC_IN_PROGRESS",
    });
    expect(fb.calls).not.toContain("signOut");
    await alarmCycle; // the alarm's cycle uploads what the user would have been asked to discard
    expect(uploaded).toEqual([interval.id]);
    expect(await auth.disconnect({ includeQuarantined: true })).toEqual({ ok: true });
  });

  it("AUTH-12c a skipped final sync with a confirmed discard still disconnects", async () => {
    const { auth, fb, ld } = setup({ pending: 2 });
    fb.setCurrent(session("alice"));
    ld.localData.flush = async () => ({ remaining: 2, skipped: true });
    expect(await auth.disconnect({ discardUnsynced: true })).toEqual({ ok: true });
  });
});

describe("auth lock that is never released (AUTH-10c, grill E1)", () => {
  function stuckSetup() {
    const fb = fakeBackend();
    fb.setCurrent({ ...session("alice"), expiresAt: nowS + 30 }); // needs a refresh
    let never: Promise<never> = new Promise(() => undefined);
    fb.backend.refresh = () => never; // a holder that never finishes
    const ld = fakeLocalData(0);
    const auth = createAuthService({
      backend: fb.backend,
      storage: fakeStorage(),
      localData: ld.localData,
      now: () => NOW_MS,
      lock: { acquireTimeoutMs: 20 },
    });
    never = new Promise(() => undefined);
    return { auth, fb, ld };
  }

  it("AUTH-10c a later token request is temporarily unavailable instead of waiting forever", async () => {
    const { auth } = stuckSetup();
    void auth.accessToken(); // holds the lock forever
    expect(await auth.accessToken()).toBeNull();
  });

  it("AUTH-10c Disconnect behind a stuck holder changes nothing and says still syncing", async () => {
    const { auth, fb, ld } = stuckSetup();
    void auth.accessToken();
    expect(await auth.disconnect()).toEqual({ ok: false, code: "SYNC_IN_PROGRESS" });
    expect(ld.state.calls).toEqual([]);
    expect(fb.calls).not.toContain("signOut");
  });
});
