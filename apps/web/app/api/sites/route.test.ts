import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  insert: { data: null, error: null } as { data: unknown; error: Record<string, unknown> | null },
  lookup: { data: null } as { data: unknown },
  deleteResult: { error: null } as { error: Record<string, unknown> | null },
}));

vi.mock("@/lib/security/origin", () => ({ isSameOrigin: () => true }));
vi.mock("@/lib/supabase/server", () => ({
  getCurrentUser: async () => ({ id: "u1" }),
  createClient: async () => ({
    from: () => ({
      insert: () => ({ select: () => ({ single: async () => state.insert }) }),
      select: () => ({ eq: () => ({ maybeSingle: async () => state.lookup }) }),
      delete: () => ({ eq: async () => state.deleteResult }),
    }),
  }),
}));

import { DELETE } from "./[id]/route";
import { POST } from "./route";

const post = () =>
  POST(
    new Request("http://x/api/sites", {
      method: "POST",
      body: JSON.stringify({ domain: "leetcode.com" }),
    }),
  );

let logged: string[] = [];
beforeEach(() => {
  logged = [];
  vi.spyOn(console, "error").mockImplementation((line) => {
    logged.push(String(line));
  });
  state.insert = { data: null, error: null };
  state.lookup = { data: null };
  state.deleteResult = { error: null };
});

describe("POST /api/sites (DASH-12, DATA-01)", () => {
  it("DASH-12 adding a new site answers 201", async () => {
    state.insert = { data: { id: "s1", domain: "leetcode.com" }, error: null };
    expect((await post()).status).toBe(201);
  });

  it("DASH-12 DATA-01 re-adding a tracked site at the limit succeeds instead of LIMIT_REACHED", async () => {
    state.insert = { data: null, error: { code: "P0001", hint: "DATA-01", message: "limit" } };
    state.lookup = { data: { id: "s1", domain: "leetcode.com" } };
    const res = await post();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "s1", domain: "leetcode.com" });
  });

  it("DATA-01 a new site at the limit is still refused with LIMIT_REACHED", async () => {
    state.insert = { data: null, error: { code: "P0001", hint: "DATA-01", message: "limit" } };
    const res = await post();
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "LIMIT_REACHED" });
  });

  it("DASH-12 a unique violation returns the existing site", async () => {
    state.insert = { data: null, error: { code: "23505", message: "dup" } };
    state.lookup = { data: { id: "s1", domain: "leetcode.com" } };
    expect((await post()).status).toBe(200);
  });

  it("ENV-11 an unexpected database error is logged (no input) before the 500", async () => {
    state.insert = { data: null, error: { code: "XX000", message: "boom" } };
    const res = await post();
    expect(res.status).toBe(500);
    expect(logged).toHaveLength(1);
    expect(JSON.parse(logged[0] ?? "{}")).toMatchObject({
      event: "sites.add.failed",
      code: "XX000",
      message: "boom",
    });
    expect(logged[0]).not.toContain("leetcode");
  });
});

describe("DELETE /api/sites/:id (DASH-12)", () => {
  it("ENV-11 a database error is logged before the 500", async () => {
    state.deleteResult = { error: { code: "XX000", message: "boom" } };
    const id = "00000000-0000-4000-8000-000000000001";
    const res = await DELETE(new Request(`http://x/api/sites/${id}`, { method: "DELETE" }), {
      params: Promise.resolve({ id }),
    });
    expect(res.status).toBe(500);
    expect(JSON.parse(logged[0] ?? "{}")).toMatchObject({ event: "sites.delete.failed" });
  });
});
