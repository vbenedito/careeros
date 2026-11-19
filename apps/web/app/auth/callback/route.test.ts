import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ siteUrl: () => "https://app.test" }));
vi.mock("@/lib/log", () => ({
  errorFields: () => ({}),
  logServerError: () => {},
  urlErrorCode: () => "unknown",
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { exchangeCodeForSession: async () => ({ error: null }) },
  }),
}));

import { GET } from "./route";

describe("GET /auth/callback (AUTH-05)", () => {
  it("AUTH-05 a provider error without a code goes to sign-in with the oauth message", async () => {
    const response = await GET(
      new Request("https://app.test/auth/callback?error=access_denied&error_code=unverified"),
    );
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://app.test/sign-in?error=oauth");
  });
});
