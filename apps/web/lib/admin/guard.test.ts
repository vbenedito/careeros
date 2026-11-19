import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const nav = vi.hoisted(() => ({
  notFound: vi.fn((): never => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("next/navigation", () => ({ notFound: nav.notFound }));
// `cache` memoizes per request in Next; here every call runs.
vi.mock("react", async (orig) => ({
  ...(await orig<typeof import("react")>()),
  cache: <T>(f: T) => f,
}));
const client = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client.current }));

import { isAdmin, requireAdmin } from "./guard";

interface Fake {
  sub: string | null;
  claimsError?: boolean;
  row?: { user_id: string } | null;
  rowError?: boolean;
}

/** Records what the guard asks the database. */
function fake({ sub, claimsError, row = null, rowError }: Fake) {
  const calls: { table: string; column: string; value: unknown }[] = [];
  const supabase = {
    auth: {
      getClaims: async () =>
        claimsError
          ? { data: null, error: new Error("x") }
          : { data: sub ? { claims: { sub } } : null, error: null },
    },
    from: (table: string) => ({
      select: () => ({
        eq: (column: string, value: unknown) => {
          calls.push({ table, column, value });
          return {
            maybeSingle: async () => ({ data: row, error: rowError ? new Error("x") : null }),
          };
        },
      }),
    }),
  };
  return { supabase: supabase as unknown as SupabaseClient, calls };
}

beforeEach(() => {
  nav.notFound.mockClear();
});

describe("admin guard (ADM-02)", () => {
  it("ADM-02 signed out: not admin, and the database is never asked", async () => {
    const { supabase, calls } = fake({ sub: null });
    expect(await isAdmin(supabase)).toBe(false);
    expect(calls).toEqual([]);
  });

  it("ADM-02 claims error: not admin", async () => {
    const { supabase, calls } = fake({ sub: "u1", claimsError: true });
    expect(await isAdmin(supabase)).toBe(false);
    expect(calls).toEqual([]);
  });

  it("ADM-02 signed in without an admins row: not admin; the query is the user's own row", async () => {
    const { supabase, calls } = fake({ sub: "u1", row: null });
    expect(await isAdmin(supabase)).toBe(false);
    expect(calls).toEqual([{ table: "admins", column: "user_id", value: "u1" }]);
  });

  it("ADM-02 signed in with an admins row: admin", async () => {
    const { supabase } = fake({ sub: "u1", row: { user_id: "u1" } });
    expect(await isAdmin(supabase)).toBe(true);
  });

  it("ADM-02 a database error means not admin, a row of someone else too", async () => {
    expect(
      await isAdmin(fake({ sub: "u1", rowError: true, row: { user_id: "u1" } }).supabase),
    ).toBe(false);
    expect(await isAdmin(fake({ sub: "u1", row: { user_id: "u2" } }).supabase)).toBe(false);
  });

  it("ADM-02 requireAdmin answers notFound() for signed out and not admin, and passes an admin", async () => {
    client.current = fake({ sub: null }).supabase;
    await expect(requireAdmin()).rejects.toThrow("NEXT_NOT_FOUND");
    client.current = fake({ sub: "u1" }).supabase;
    await expect(requireAdmin()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(nav.notFound).toHaveBeenCalledTimes(2);
    client.current = fake({ sub: "u1", row: { user_id: "u1" } }).supabase;
    await expect(requireAdmin()).resolves.toBeUndefined();
    expect(nav.notFound).toHaveBeenCalledTimes(2);
  });

  it("ADM-02 requireAdmin answers notFound() when the client cannot even be created", async () => {
    client.current = { auth: { getClaims: async () => Promise.reject(new Error("boom")) } };
    await expect(requireAdmin()).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
