import { describe, expect, it } from "vitest";
import { createSyncTriggers, storedSessionUserId } from "./triggers";

const sessionOf = (userId: string, token = "a") =>
  JSON.stringify({ access_token: token, refresh_token: "r", user: { id: userId } });

function setup() {
  const calls: string[] = [];
  const triggers = createSyncTriggers({
    runSync: async () => calls.push("sync"),
    refreshDomains: async () => calls.push("domains"),
  });
  return { triggers, calls };
}

describe("sync and site-list triggers (SYNC-02, SYNC-09, #54)", () => {
  it("SYNC-09 every sync alarm also refreshes the site list (within SYNC_PERIOD_MIN)", async () => {
    const { triggers, calls } = setup();
    await triggers.onAlarm();
    expect(calls).toEqual(["sync", "domains"]);
  });

  it("SYNC-09c a token refresh (same user) syncs but does not refetch the site list", async () => {
    const { triggers, calls } = setup();
    await triggers.onSessionChange({
      oldValue: sessionOf("alice", "a"),
      newValue: sessionOf("alice", "b"),
    });
    expect(calls).toEqual(["sync"]);
  });

  it("SYNC-09c a new user (connect, reconnect) syncs and refreshes the site list", async () => {
    const { triggers, calls } = setup();
    await triggers.onSessionChange({ newValue: sessionOf("alice") });
    await triggers.onSessionChange({ oldValue: sessionOf("alice"), newValue: sessionOf("bob") });
    expect(calls).toEqual(["sync", "domains", "sync", "domains"]);
  });

  it("a removed session triggers nothing", async () => {
    const { triggers, calls } = setup();
    await triggers.onSessionChange({ oldValue: sessionOf("alice") });
    expect(calls).toEqual([]);
  });

  it("reads the user id from the stored session, or null", () => {
    expect(storedSessionUserId(sessionOf("u1"))).toBe("u1");
    expect(storedSessionUserId("not json")).toBeNull();
    expect(storedSessionUserId(undefined)).toBeNull();
    expect(storedSessionUserId(JSON.stringify({ user: {} }))).toBeNull();
  });
});
