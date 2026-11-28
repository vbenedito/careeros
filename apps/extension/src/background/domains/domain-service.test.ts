import { describe, expect, it } from "vitest";
import { fakeStorage } from "../../test/fakes";
import { createAccountEpoch } from "../account-epoch";
import { DOMAINS_CACHE_KEY } from "../tracking/keys";
import { createDomainService, type DomainsApi, DomainsApiError } from "./domain-service";

function setup(
  options: {
    connected?: boolean | (() => boolean);
    server?: string[];
    limit?: number;
    /** SYNC-09d: the server's setting; an Error makes the read fail. */
    setting?: boolean | Error;
    /** PSR-19: the server's active rules; an Error makes the read fail. */
    rules?: unknown[] | Error;
  } = {},
) {
  const server = new Set(options.server ?? ["leetcode.com"]);
  let failWith: DomainsApiError | null = null;
  const api: DomainsApi = {
    list: async () => {
      if (failWith) throw failWith;
      return [...server];
    },
    insert: async (d) => {
      if (failWith) throw failWith;
      // Like the DATA-01 trigger: the limit is checked before the unique constraint.
      if (options.limit !== undefined && server.size >= options.limit) {
        throw new DomainsApiError("LIMIT_REACHED");
      }
      server.add(d);
    },
    delete: async (d) => {
      if (failWith) throw failWith;
      server.delete(d);
    },
    trackProblems: async () => {
      reads++;
      if (s.setting instanceof Error) throw s.setting;
      return s.setting;
    },
    problemRules: async () => {
      if (s.rules instanceof Error) throw s.rules;
      return s.rules;
    },
  };
  let reads = 0;
  const s = {
    setting: options.setting ?? (false as boolean | Error),
    rules: options.rules ?? ([] as unknown[] | Error),
  };
  const storage = fakeStorage();
  let rejected = 0;
  const service = createDomainService({
    api,
    storage,
    isConnected: async () =>
      typeof options.connected === "function" ? options.connected() : (options.connected ?? true),
    sessionRejected: async () => {
      rejected++;
    },
    now: () => 1000,
  });
  const cache = () => storage.data.get(DOMAINS_CACHE_KEY);
  return {
    service,
    server,
    storage,
    cache,
    fail: (e: DomainsApiError | null) => (failWith = e),
    setSetting: (v: boolean | Error) => (s.setting = v),
    setRules: (v: unknown[] | Error) => (s.rules = v),
    settingReads: () => reads,
    rejected: () => rejected,
  };
}

const HI = { domain: "hellointerview.com", prefix: ["practice", "system-design"], kind: "id" };

describe("problem rules sync (PSR-16, PSR-19, PSR-20)", () => {
  it("PSR-19 a refresh caches the account's rules with the list", async () => {
    const s = setup({ server: ["hellointerview.com"], rules: [{ ...HI, label: "HI" }] });
    await s.service.refresh();
    expect(s.cache()).toMatchObject({ problemRules: [HI] }); // the label is never kept (PSR-25)
  });

  it("PSR-16 an invalid downloaded rule is dropped alone, the others are cached", async () => {
    const bad = [
      { ...HI, domain: "com" },
      { ...HI, prefix: [] },
      { ...HI, prefix: ["a", "b", "c", "d"] },
      { ...HI, prefix: ["Practice"] },
      { ...HI, kind: "regex" },
      { ...HI, domain: "leetcode.com" },
      "nope",
      null,
    ];
    const slugRule = { ...HI, prefix: ["problems"], kind: "slug" }; // the DB allows it
    const s = setup({ rules: [...bad, HI, { ...HI }, slugRule] });
    await s.service.refresh();
    expect(s.cache()).toMatchObject({ problemRules: [HI, slugRule] }); // the duplicate keeps the first
  });

  it("PSR-19 a failed read of the rules never fails the refresh and keeps the last good rules", async () => {
    const s = setup({ rules: [HI] });
    await s.service.refresh();
    s.setRules(new DomainsApiError("UNAVAILABLE"));
    expect(await s.service.refresh()).toEqual({ ok: true, domains: ["leetcode.com"] });
    expect(s.cache()).toMatchObject({ problemRules: [HI] });
    expect(s.rejected()).toBe(0);
  });

  it("PSR-20 a failed first read caches no rules", async () => {
    const s = setup({ rules: new DomainsApiError("UNAVAILABLE") });
    await s.service.refresh();
    expect(s.cache()).toMatchObject({ problemRules: [] });
  });

  it("PSR-19 a removed rule leaves the cache at the next refresh", async () => {
    const s = setup({ rules: [HI] });
    await s.service.refresh();
    s.setRules([]);
    await s.service.refresh();
    expect(s.cache()).toMatchObject({ problemRules: [] });
  });
});

describe("tracked-domain sync (SYNC-09..11)", () => {
  it("#113 invalid server rows are dropped before caching", async () => {
    const s = setup({ server: ["leetcode.com", "com", "www.neetcode.io", "LeetCode.org"] });
    expect(await s.service.refresh()).toEqual({ ok: true, domains: ["leetcode.com"] });
    expect(s.cache()).toEqual({
      domains: ["leetcode.com"],
      trackProblems: false,
      problemRules: [],
      fetchedAt: 1000,
    });
  });

  it("#113 a list fetched across a change of account is not cached", async () => {
    const storage = fakeStorage();
    const epoch = createAccountEpoch();
    const service = createDomainService({
      api: {
        list: async () => {
          epoch.bump(); // e.g. the session was invalidated and local data forgotten meanwhile
          return ["leetcode.com"];
        },
        insert: async () => {},
        delete: async () => {},
        trackProblems: async () => true,
        problemRules: async () => [],
      },
      storage,
      isConnected: async () => true,
      sessionRejected: async () => {},
      now: () => 1000,
      epoch,
    });
    expect(await service.refresh()).toEqual({ ok: false, error: "NOT_CONNECTED" });
    expect(storage.data.has(DOMAINS_CACHE_KEY)).toBe(false);
  });

  it("SYNC-09 refresh replaces the cache with the server list (sorted)", async () => {
    const s = setup({ server: ["neetcode.io", "leetcode.com"] });
    expect(await s.service.refresh()).toEqual({
      ok: true,
      domains: ["leetcode.com", "neetcode.io"],
    });
    expect(s.cache()).toEqual({
      domains: ["leetcode.com", "neetcode.io"],
      trackProblems: false,
      problemRules: [],
      fetchedAt: 1000,
    });
  });

  it("SYNC-09d PRB-03 every refresh reads the problem setting and caches it with the list", async () => {
    const s = setup({ setting: true });
    await s.service.refresh();
    expect(s.cache()).toMatchObject({ domains: ["leetcode.com"], trackProblems: true });
    s.setSetting(false);
    await s.service.add("neetcode.io");
    expect(s.cache()).toMatchObject({ trackProblems: false });
    expect(s.settingReads()).toBe(2);
  });

  it("SYNC-09d PRB-04 a failed read of the setting is off and never fails the list refresh", async () => {
    const s = setup({ setting: true });
    await s.service.refresh();
    s.setSetting(new DomainsApiError("UNAVAILABLE"));
    expect(await s.service.refresh()).toEqual({ ok: true, domains: ["leetcode.com"] });
    expect(s.cache()).toMatchObject({ domains: ["leetcode.com"], trackProblems: false });
    s.setSetting(new DomainsApiError("UNAUTHORIZED"));
    expect(await s.service.refresh()).toEqual({ ok: true, domains: ["leetcode.com"] });
    expect(s.rejected()).toBe(0);
  });

  it("SYNC-09d SYNC-09b the setting is not cached when the account is gone meanwhile", async () => {
    let connected = true;
    const s = setup({ setting: true, connected: () => connected });
    connected = false;
    expect(await s.service.refresh()).toEqual({ ok: false, error: "NOT_CONNECTED" });
    expect(s.cache()).toBeUndefined();
  });

  it("SYNC-10 add normalizes the input, writes to the server first, then updates the cache", async () => {
    const s = setup();
    expect(await s.service.add("https://www.NeetCode.io/roadmap?x=1")).toEqual({
      ok: true,
      domains: ["leetcode.com", "neetcode.io"],
    });
    expect(s.server.has("neetcode.io")).toBe(true);
  });

  it("SYNC-10 invalid input never reaches the server", async () => {
    const s = setup();
    expect(await s.service.add("not a domain")).toEqual({ ok: false, error: "INVALID_DOMAIN" });
    expect(s.cache()).toBeUndefined();
  });

  it("SYNC-10 on a server error the cache is unchanged and the error is reported", async () => {
    const s = setup();
    await s.service.refresh();
    const before = s.cache();
    s.fail(new DomainsApiError("UNAVAILABLE"));
    expect(await s.service.add("neetcode.io")).toEqual({ ok: false, error: "UNAVAILABLE" });
    s.fail(new DomainsApiError("LIMIT_REACHED"));
    expect(await s.service.add("neetcode.io")).toEqual({ ok: false, error: "LIMIT_REACHED" });
    expect(s.cache()).toEqual(before);
  });

  it("ENT-07 ENT-09 the limit from the server's error reaches the popup reply", async () => {
    const s = setup();
    await s.service.refresh();
    s.fail(new DomainsApiError("LIMIT_REACHED", 25));
    expect(await s.service.add("neetcode.io")).toEqual({
      ok: false,
      error: "LIMIT_REACHED",
      limit: 25,
    });
  });

  it("SYNC-11 remove deletes on the server and from the cache", async () => {
    const s = setup({ server: ["leetcode.com", "neetcode.io"] });
    expect(await s.service.remove("neetcode.io")).toEqual({ ok: true, domains: ["leetcode.com"] });
  });

  it("AUTH-11 a rejected session is reported and marks the extension for reconnect", async () => {
    const s = setup();
    s.fail(new DomainsApiError("UNAUTHORIZED"));
    expect(await s.service.refresh()).toEqual({ ok: false, error: "NOT_CONNECTED" });
    expect(s.rejected()).toBe(1);
  });

  it("nothing is called while not connected", async () => {
    const s = setup({ connected: false });
    expect(await s.service.refresh()).toEqual({ ok: false, error: "NOT_CONNECTED" });
    expect(s.cache()).toBeUndefined();
  });
});

describe("domain sync hardening (#54, #65)", () => {
  it("SYNC-09b a Disconnect finished while the list was in flight: the old list is not written back", async () => {
    let connected = true;
    const s = setup({ connected: () => connected });
    const realList = s.service.refresh;
    // Disconnect lands between the server answer and the cache write.
    const listing = realList();
    connected = false;
    expect(await listing).toEqual({ ok: false, error: "NOT_CONNECTED" });
    expect(s.cache()).toBeUndefined();
  });

  it("SYNC-10a re-adding a tracked site at the limit is a no-op, not LIMIT_REACHED", async () => {
    const twelve = Array.from({ length: 12 }, (_, i) => `site${i}.com`);
    const s = setup({ server: twelve, limit: 12 });
    await s.service.refresh();
    expect(await s.service.add("https://www.site3.com/x")).toMatchObject({ ok: true });
    // Stale cache (another device added it): the server's limit error is checked against its list.
    s.storage.data.delete(DOMAINS_CACHE_KEY);
    expect(await s.service.add("site4.com")).toMatchObject({ ok: true });
    // A genuinely new site at the limit is still refused.
    expect(await s.service.add("new.com")).toEqual({ ok: false, error: "LIMIT_REACHED" });
  });
});
