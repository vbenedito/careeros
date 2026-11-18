import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  sameOrigin: true,
  user: { id: "u1" } as { id: string } | null,
  rpcError: null as Record<string, unknown> | null,
  rpcCalls: [] as [string, unknown][],
}));

vi.mock("@/lib/security/origin", () => ({ isSameOrigin: () => state.sameOrigin }));
vi.mock("@/lib/supabase/server", () => ({
  getCurrentUser: async () => state.user,
  createClient: async () => ({
    rpc: async (name: string, args: unknown) => {
      state.rpcCalls.push([name, args]);
      return { error: state.rpcError };
    },
  }),
}));

import { PUT } from "./route";

const put = (body: unknown) =>
  PUT(
    new Request("http://x/api/settings/problems", {
      method: "PUT",
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
  state.rpcError = null;
  state.rpcCalls = [];
});

describe("PUT /api/settings/problems (DASH-16, PRB-02)", () => {
  it("SEC-08 a request from another origin is refused before anything runs", async () => {
    state.sameOrigin = false;
    expect((await put({ enabled: true })).status).toBe(403);
    expect(state.rpcCalls).toEqual([]);
  });

  it("AUTH-03 no session answers 401 NOT_AUTHENTICATED", async () => {
    state.user = null;
    const res = await put({ enabled: true });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "NOT_AUTHENTICATED" });
    expect(state.rpcCalls).toEqual([]);
  });

  it("DASH-16 turning on calls set_problem_tracking without deleting history", async () => {
    const res = await put({ enabled: true });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ enabled: true });
    expect(state.rpcCalls).toEqual([
      ["set_problem_tracking", { p_enabled: true, p_delete_history: false }],
    ]);
  });

  it("PRB-16 turn off and keep history: deleteHistory false", async () => {
    await put({ enabled: false, deleteHistory: false });
    expect(state.rpcCalls).toEqual([
      ["set_problem_tracking", { p_enabled: false, p_delete_history: false }],
    ]);
  });

  it("PRB-16 turn off and delete history: deleteHistory true", async () => {
    const res = await put({ enabled: false, deleteHistory: true });
    expect(await res.json()).toEqual({ enabled: false });
    expect(state.rpcCalls).toEqual([
      ["set_problem_tracking", { p_enabled: false, p_delete_history: true }],
    ]);
  });

  it("DASH-16 deleteHistory true with enabled true is 400 and never reaches the database", async () => {
    const res = await put({ enabled: true, deleteHistory: true });
    expect(res.status).toBe(400);
    expect(state.rpcCalls).toEqual([]);
  });

  it("DASH-16 a body that is not JSON or has the wrong shape is 400", async () => {
    expect((await put("not json")).status).toBe(400);
    expect((await put({ enabled: "yes" })).status).toBe(400);
    expect((await put({})).status).toBe(400);
    expect(state.rpcCalls).toEqual([]);
  });

  it("AUTH-13 the database's NOT_AUTHENTICATED (PT401) answers 401", async () => {
    state.rpcError = { code: "PT401", message: "NOT_AUTHENTICATED" };
    expect((await put({ enabled: true })).status).toBe(401);
  });

  it("ENV-11 an unexpected database error is logged (no input) before the 500", async () => {
    state.rpcError = { code: "XX000", message: "boom" };
    const res = await put({ enabled: false, deleteHistory: true });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "INTERNAL" });
    expect(JSON.parse(logged[0] ?? "{}")).toMatchObject({
      event: "problems.set_failed",
      code: "XX000",
    });
  });
});
