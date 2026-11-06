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
const handle = createInternalMessageHandler({ extensionId: "ext", domains });

describe("popup → worker messages (EXT-UI-05a)", () => {
  it("EXT-UI-05a routes valid commands from the extension's own pages", async () => {
    expect(await handle({ type: "DOMAINS_REFRESH" }, { id: "ext" })).toEqual(ok);
    expect(await handle({ type: "DOMAINS_ADD", input: "neetcode.io" }, { id: "ext" })).toEqual(ok);
    expect(await handle({ type: "DOMAINS_REMOVE", domain: "neetcode.io" }, { id: "ext" })).toEqual(
      ok,
    );
    expect(calls).toEqual(["refresh", "add:neetcode.io", "remove:neetcode.io"]);
  });

  it("SEC-05 ignores other extensions, tabs and malformed messages", async () => {
    calls.length = 0;
    expect(await handle({ type: "DOMAINS_REFRESH" }, { id: "other" })).toBeNull();
    expect(await handle({ type: "DOMAINS_REFRESH" }, { id: "ext", tab: {} })).toBeNull();
    expect(await handle({ type: "DOMAINS_ADD" }, { id: "ext" })).toBeNull();
    expect(await handle({ type: "DOMAINS_REFRESH", extra: 1 }, { id: "ext" })).toBeNull();
    expect(calls).toEqual([]);
  });
});
