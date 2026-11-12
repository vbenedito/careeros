import { describe, expect, it } from "vitest";
import type { DomainService } from "../domains/domain-service";
import { createInternalMessageHandler } from "./internal";

const ok = { ok: true as const, domains: ["leetcode.com"] };
const calls: string[] = [];
const record = (name: string) => async (arg?: string) => {
  calls.push(arg === undefined ? name : `${name}:${arg}`);
  return ok;
};
const domains: DomainService = {
  refresh: record("refresh"),
  add: record("add"),
  remove: record("remove"),
};
const OWN = { id: "ext", url: "chrome-extension://ext/popup.html" };
const handle = createInternalMessageHandler({
  extensionId: "ext",
  domains,
  authStatus: async () => ({ connected: true, email: "a@example.test", needsReconnect: false }),
  setTracking: async (enabled) => {
    calls.push(`tracking:${enabled}`);
    return enabled;
  },
  disconnect: async (discard) =>
    discard ? { ok: true } : { ok: false, code: "UNSYNCED_DATA", pending: 2 },
  forgetLocalData: async () => {
    calls.push("forget");
    return { ok: true };
  },
});

describe("popup → worker messages (EXT-UI-05a)", () => {
  it("EXT-UI-05a routes valid commands from the extension's own pages", async () => {
    expect(await handle({ type: "DOMAINS_REFRESH" }, OWN)).toEqual(ok);
    expect(await handle({ type: "DOMAINS_ADD", input: "neetcode.io" }, OWN)).toEqual(ok);
    expect(await handle({ type: "DOMAINS_REMOVE", domain: "neetcode.io" }, OWN)).toEqual(ok);
    expect(calls).toEqual(["refresh", "add:neetcode.io", "remove:neetcode.io"]);
    expect(await handle({ type: "TRACKING_SET", enabled: false }, OWN)).toEqual({
      ok: true,
      enabled: false,
    });
    expect(calls.at(-1)).toBe("tracking:false");
    expect(await handle({ type: "DISCONNECT", discardUnsynced: false }, OWN)).toEqual({
      ok: false,
      code: "UNSYNCED_DATA",
      pending: 2,
    });
    // #113 AUTH-11 explicit discard while disconnected.
    expect(await handle({ type: "FORGET_LOCAL_DATA" }, OWN)).toEqual({ ok: true });
    expect(calls.at(-1)).toBe("forget");
    expect(await handle({ type: "DISCONNECT", discardUnsynced: true }, OWN)).toEqual({ ok: true });
    expect(await handle({ type: "AUTH_STATUS" }, OWN)).toEqual({
      connected: true,
      email: "a@example.test",
      needsReconnect: false,
    });
  });

  it("SEC-05 ignores other extensions, web pages and malformed messages", async () => {
    calls.length = 0;
    expect(
      await handle(
        { type: "DOMAINS_REFRESH" },
        { id: "other", url: "chrome-extension://other/popup.html" },
      ),
    ).toBeNull();
    expect(
      await handle({ type: "DOMAINS_REFRESH" }, { id: "ext", url: "https://evil.example/" }),
    ).toBeNull();
    expect(await handle({ type: "DOMAINS_ADD" }, OWN)).toBeNull();
    expect(await handle({ type: "DOMAINS_REFRESH", extra: 1 }, OWN)).toBeNull();
    expect(calls).toEqual([]);
  });
});

describe("builds without Supabase config (#65, EXT-UI-05c)", () => {
  const bare = createInternalMessageHandler({
    extensionId: "ext",
    domains: null,
    authStatus: async () => ({ connected: false, email: null, needsReconnect: false }),
    setTracking: async (enabled) => enabled,
    disconnect: async () => ({ ok: false, code: "FAILED" }),
    forgetLocalData: async () => ({ ok: false, code: "FAILED" }),
  });

  it("EXT-UI-05c every popup command gets a reply instead of silence", async () => {
    const notConfigured = { ok: false, error: "NOT_CONFIGURED", code: "FAILED" };
    expect(await bare({ type: "DOMAINS_REFRESH" }, OWN)).toEqual(notConfigured);
    expect(await bare({ type: "DOMAINS_ADD", input: "a.com" }, OWN)).toEqual(notConfigured);
    expect(await bare({ type: "DOMAINS_REMOVE", domain: "a.com" }, OWN)).toEqual(notConfigured);
    expect(await bare({ type: "TRACKING_SET", enabled: true }, OWN)).toEqual({
      ok: true,
      enabled: true,
    });
    expect(await bare({ type: "DISCONNECT", discardUnsynced: false }, OWN)).toEqual({
      ok: false,
      code: "FAILED",
    });
    expect(await bare({ type: "AUTH_STATUS" }, OWN)).toMatchObject({ connected: false });
  });
});
