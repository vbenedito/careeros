import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  sameOrigin: true,
  user: { id: "u1" } as { id: string } | null,
  rpc: { data: "00000000-0000-4000-8000-000000000001", error: null } as {
    data: unknown;
    error: Record<string, unknown> | null;
  },
  rpcCalls: [] as [string, unknown][],
}));

vi.mock("@/lib/security/origin", () => ({ isSameOrigin: () => state.sameOrigin }));
vi.mock("@/lib/supabase/server", () => ({
  getCurrentUser: async () => state.user,
  createClient: async () => ({
    rpc: async (name: string, args: unknown) => {
      state.rpcCalls.push([name, args]);
      return state.rpc;
    },
  }),
}));

import { POST } from "./route";

const rule = {
  domain: "hellointerview.com",
  prefix: ["practice", "system-design"],
  kind: "id",
  label: "System design",
  confirmedProblemId: true,
};
const post = (body: unknown) =>
  POST(
    new Request("http://x/api/settings/problem-rules", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

let logged: string[] = [];
beforeEach(() => {
  logged = [];
  vi.spyOn(console, "error").mockImplementation((line) => {
    logged.push(String(line));
  });
  state.sameOrigin = true;
  state.user = { id: "u1" };
  state.rpc = { data: "00000000-0000-4000-8000-000000000001", error: null };
  state.rpcCalls = [];
  vi.stubEnv("EXTENSION_STORE_VERSION", "0.4.0");
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/settings/problem-rules (DASH-16, PSR-12)", () => {
  it("ENV-05c PSR-21 with the store older than 0.4.0 or unset the route answers 404 and does nothing", async () => {
    for (const value of ["0.3.1", "", undefined]) {
      vi.stubEnv("EXTENSION_STORE_VERSION", value);
      const res = await post(rule);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "NOT_FOUND" });
    }
    expect(state.rpcCalls).toEqual([]);
  });

  it("SEC-08 AUTH-03 another origin is 403, no session is 401", async () => {
    state.sameOrigin = false;
    expect((await post(rule)).status).toBe(403);
    state.sameOrigin = true;
    state.user = null;
    expect((await post(rule)).status).toBe(401);
    expect(state.rpcCalls).toEqual([]);
  });

  it("PSR-12 adds the rule through add_problem_rule and answers its id", async () => {
    const res = await post(rule);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: "00000000-0000-4000-8000-000000000001" });
    expect(state.rpcCalls).toEqual([
      [
        "add_problem_rule",
        {
          p_domain: "hellointerview.com",
          p_prefix: ["practice", "system-design"],
          p_kind: "id",
          p_label: "System design",
          p_confirmed: true,
        },
      ],
    ]);
  });

  it("PSR-25 PSR-16 SEC-10 a bad body never reaches the database (no confirmation, URL field, built-in site)", async () => {
    const bad = [
      "not json",
      {},
      { ...rule, confirmedProblemId: false },
      { ...rule, url: "https://hellointerview.com/x?y=1" },
      { ...rule, domain: "leetcode.com" },
      { ...rule, prefix: [] },
    ];
    for (const body of bad) expect((await post(body)).status).toBe(400);
    expect(state.rpcCalls).toEqual([]);
  });

  it("PSR-15 the cap answers 422 LIMIT_REACHED with the number from the error", async () => {
    state.rpc = {
      data: null,
      error: {
        code: "P0001",
        message: "LIMIT_REACHED",
        hint: "PSR-15",
        details: JSON.stringify({
          code: "LIMIT_REACHED",
          limit: 5,
          plan: "free",
          kind: "problem_rules",
        }),
      },
    };
    const res = await post(rule);
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "LIMIT_REACHED", limit: 5 });
  });

  it("PSR-15 a cap error without details still says LIMIT_REACHED", async () => {
    state.rpc = { data: null, error: { code: "P0001", message: "x", hint: "PSR-15" } };
    const res = await post(rule);
    expect(await res.json()).toEqual({ error: "LIMIT_REACHED" });
  });

  it("PSR-16 PSR-09 database refusals map to codes", async () => {
    const map: [Record<string, unknown>, number, string][] = [
      [{ code: "23505", message: "DUPLICATE_RULE" }, 409, "DUPLICATE_RULE"],
      [{ code: "22023", message: "DOMAIN_NOT_TRACKED" }, 400, "DOMAIN_NOT_TRACKED"],
      [{ code: "22023", message: "BUILT_IN_DOMAIN" }, 400, "BUILT_IN_DOMAIN"],
      [{ code: "22023", message: "CONFIRMATION_REQUIRED" }, 400, "CONFIRMATION_REQUIRED"],
      [{ code: "PT401", message: "NOT_AUTHENTICATED" }, 401, "NOT_AUTHENTICATED"],
    ];
    for (const [error, status, code] of map) {
      state.rpc = { data: null, error };
      const res = await post(rule);
      expect(res.status).toBe(status);
      expect(await res.json()).toEqual({ error: code });
    }
  });

  it("ENV-11 PSR-11 an unexpected error is logged without the rule, the domain or any id, then 500", async () => {
    state.rpc = { data: null, error: { code: "XX000", message: "boom hellointerview.com" } };
    const res = await post(rule);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "INTERNAL" });
    const line = logged.join("\n");
    expect(JSON.parse(logged[0] ?? "{}")).toMatchObject({
      event: "problem_rules.add_failed",
      code: "XX000",
    });
    expect(line).not.toContain("system-design");
    expect(line).not.toContain("System design");
  });
});
