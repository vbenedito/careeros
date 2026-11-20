import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  calls: [] as unknown[],
}));

vi.mock("@/lib/env", () => ({ siteUrl: () => "https://app.test" }));
vi.mock("@/lib/security/origin", () => ({ isSameOrigin: () => true }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      signInWithOAuth: async (args: unknown) => {
        state.calls.push(args);
        return { data: { url: "https://provider.test/authorize" }, error: null };
      },
    },
  }),
}));

import { POST } from "./route";

const signIn = (provider: string) => {
  const body = new FormData();
  body.set("provider", provider);
  return POST(new Request("https://app.test/auth/sign-in", { method: "POST", body }));
};

beforeEach(() => {
  state.calls = [];
});

describe("POST /auth/sign-in (AUTH-05)", () => {
  it("AUTH-05 GitHub sign-in asks for the user:email scope so a verified email is shared", async () => {
    const response = await signIn("github");
    expect(response.status).toBe(303);
    expect(state.calls).toHaveLength(1);
    expect(state.calls[0]).toMatchObject({
      provider: "github",
      options: { scopes: "user:email" },
    });
  });

  it("AUTH-05 Google sign-in requests no extra scope", async () => {
    await signIn("google");
    expect(state.calls[0]).toMatchObject({ provider: "google" });
    expect(state.calls[0]).not.toHaveProperty("options.scopes");
  });
});
