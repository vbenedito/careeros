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
});

describe("popup → worker messages (EXT-UI-05a)", () => {
  it("EXT-UI-05a routes valid commands from the extension's own pages", async () => {
    expect(await handle({ type: "DOMAINS_REFRESH" }, OWN)).toEqual(ok);
    expect(await handle({ type: "DOMAINS_ADD", input: "neetcode.io" }, OWN)).toEqual(ok);
    expect(await handle({ type: "DOMAINS_REMOVE", domain: "neetcode.io" }, OWN)).toEqual(ok);
    expect(calls).toEqual(["refresh", "add:neetcode.io", "remove:neetcode.io"]);
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
