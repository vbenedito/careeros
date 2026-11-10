import { describe, expect, it } from "vitest";
import { fakeBackend, fakeLocalData, fakeStorage, session } from "../../test/fakes";
import { createAccountEpoch } from "../account-epoch";
import { DOMAINS_CACHE_KEY } from "../tracking/keys";
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
    expect(await auth.disconnect()).toEqual({ ok: false, code: "UNSYNCED_DATA" });
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
