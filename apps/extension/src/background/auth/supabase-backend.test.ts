import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeStorage } from "../../test/fakes";
import { SESSION_STORAGE_KEY } from "./storage";
import { createSupabaseAuthBackend } from "./supabase-backend";

const stored = (expiresAt: number) =>
  JSON.stringify({
    access_token: "access",
    refresh_token: "refresh",
    expires_at: expiresAt,
    user: { id: "user-1", email: "me@example.test" },
  });

afterEach(() => vi.restoreAllMocks());

describe("supabase backend: currentSession", () => {
  it("AUTH-10 reads the stored session without contacting the server, even near expiry", async () => {
    const network = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("no network allowed"));
    const nearExpiry = Math.floor(Date.now() / 1000) + 5; // supabase-js getSession() would refresh
    const backend = createSupabaseAuthBackend({
      supabaseUrl: "http://127.0.0.1:54321",
      publishableKey: "sb_publishable_test",
      storage: fakeStorage({ [SESSION_STORAGE_KEY]: stored(nearExpiry) }),
    });
    expect(await backend.currentSession()).toEqual({
      accessToken: "access",
      refreshToken: "refresh",
      expiresAt: nearExpiry,
      userId: "user-1",
      email: "me@example.test",
    });
    expect(network).not.toHaveBeenCalled();
  });

  it.each([
    ["nothing stored", undefined],
    ["invalid JSON", "{nope"],
    ["missing refresh token", JSON.stringify({ access_token: "a", user: { id: "u" } })],
  ])("returns null for %s", async (_name, raw) => {
    const backend = createSupabaseAuthBackend({
      supabaseUrl: "http://127.0.0.1:54321",
      publishableKey: "sb_publishable_test",
      storage: fakeStorage(raw === undefined ? {} : { [SESSION_STORAGE_KEY]: raw }),
    });
    expect(await backend.currentSession()).toBeNull();
  });
});
