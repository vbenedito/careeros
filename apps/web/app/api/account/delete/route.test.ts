import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ deleteError: null as { message: string } | null }));

vi.mock("@/lib/env", () => ({ siteUrl: () => "https://app.test" }));
vi.mock("@/lib/security/origin", () => ({ isSameOrigin: () => true }));
vi.mock("@/lib/auth/recent-sign-in", () => ({ isRecentSignIn: () => true }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    auth: { admin: { deleteUser: async () => ({ error: state.deleteError }) } },
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: "u1" } } }),
      getClaims: async () => ({ data: { claims: { sub: "u1" } } }),
      signOut: async () => ({}),
    },
  }),
}));

import { POST } from "./route";

const call = (confirm: string) => {
  const body = new FormData();
  body.set("confirm", confirm);
  return POST(new Request("https://app.test/api/account/delete", { method: "POST", body }));
};

beforeEach(() => {
  state.deleteError = null;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/account/delete errors (DASH-14)", () => {
  it("DASH-14 a wrong confirmation redirects with error=delete", async () => {
    expect((await call("delete")).headers.get("location")).toBe(
      "https://app.test/settings?error=delete#delete-account",
    );
  });

  it("DASH-14 a backend failure redirects with a different code, error=failed", async () => {
    state.deleteError = { message: "boom" };
    expect((await call("DELETE")).headers.get("location")).toBe(
      "https://app.test/settings?error=failed#delete-account",
    );
  });

  it("DASH-14 success goes to sign-in", async () => {
    expect((await call("DELETE")).headers.get("location")).toBe(
      "https://app.test/sign-in?deleted=1",
    );
  });
});
