import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ID = "00000000-0000-4000-8000-0000000000aa";
const state = vi.hoisted(() => ({
  sameOrigin: true,
  user: { id: "u1" } as { id: string } | null,
  error: null as Record<string, unknown> | null,
  rpcCalls: [] as [string, unknown][],
}));

vi.mock("@/lib/security/origin", () => ({ isSameOrigin: () => state.sameOrigin }));
vi.mock("@/lib/supabase/server", () => ({
  getCurrentUser: async () => state.user,
  createClient: async () => ({
    rpc: async (name: string, args: unknown) => {
      state.rpcCalls.push([name, args]);
      return { error: state.error };
    },
  }),
}));

import { DELETE } from "./route";

const del = (id: string, body: unknown) =>
  DELETE(
    new Request(`http://x/api/settings/problem-rules/${id}`, {
      method: "DELETE",
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );

let logged: string[] = [];
beforeEach(() => {
  logged = [];
  vi.spyOn(console, "error").mockImplementation((line) => {
    logged.push(String(line));
  });
  state.sameOrigin = true;
  state.user = { id: "u1" };
  state.error = null;
  state.rpcCalls = [];
  vi.stubEnv("EXTENSION_STORE_VERSION", "0.4.0");
});
afterEach(() => vi.unstubAllEnvs());

describe("DELETE /api/settings/problem-rules/:id (DASH-16, PSR-13)", () => {
  it("ENV-05c PSR-21 with the store older than 0.4.0 the route answers 404 and does nothing", async () => {
    for (const value of ["0.3.1", undefined]) {
      vi.stubEnv("EXTENSION_STORE_VERSION", value);
      const res = await del(ID, { deleteHistory: false });
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "NOT_FOUND" });
    }
    expect(state.rpcCalls).toEqual([]);
  });

  it("SEC-08 AUTH-03 another origin is 403, no session is 401", async () => {
    state.sameOrigin = false;
    expect((await del(ID, { deleteHistory: false })).status).toBe(403);
    state.sameOrigin = true;
    state.user = null;
    expect((await del(ID, { deleteHistory: false })).status).toBe(401);
    expect(state.rpcCalls).toEqual([]);
  });

  it("PSR-13 keep or delete history is passed to remove_problem_rule", async () => {
    for (const deleteHistory of [false, true]) {
      state.rpcCalls = [];
      const res = await del(ID, { deleteHistory });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ id: ID });
      expect(state.rpcCalls).toEqual([
        ["remove_problem_rule", { p_rule_id: ID, p_delete_history: deleteHistory }],
      ]);
    }
  });

  it("SEC-10 a bad id or body never reaches the database", async () => {
    expect((await del("nope", { deleteHistory: false })).status).toBe(404);
    expect((await del(ID, "not json")).status).toBe(400);
    expect((await del(ID, {})).status).toBe(400);
    expect((await del(ID, { deleteHistory: false, extra: 1 })).status).toBe(400);
    expect(state.rpcCalls).toEqual([]);
  });

  it("PSR-22 a rule that is not the caller's or already removed answers 404", async () => {
    state.error = { code: "PT404", message: "NOT_FOUND" };
    const res = await del(ID, { deleteHistory: false });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "NOT_FOUND" });
  });

  it("ENV-11 an unexpected error is logged without the rule id, then 500", async () => {
    state.error = { code: "XX000", message: "boom" };
    const res = await del(ID, { deleteHistory: true });
    expect(res.status).toBe(500);
    expect(JSON.parse(logged[0] ?? "{}")).toMatchObject({
      event: "problem_rules.remove_failed",
      code: "XX000",
    });
    expect(logged.join("\n")).not.toContain(ID);
  });
});
