import { describe, expect, it } from "vitest";
import { fakeStorage } from "../../test/fakes";
import { SESSION_STORAGE_KEY } from "./storage";
import { createSupabaseAuthBackend, REVOKE_TIMEOUT_MS } from "./supabase-backend";

describe("Supabase auth backend", () => {
  it("AUTH-12 signOutLocal always removes the local session, even offline with an expired token", async () => {
    const expired = JSON.stringify({
      access_token: "a",
      refresh_token: "r",
      expires_at: 1, // long expired: supabase-js tries to refresh first, which fails offline
      token_type: "bearer",
      user: { id: "00000000-0000-4000-8000-000000000001", email: "a@example.test" },
    });
    const storage = fakeStorage({ [SESSION_STORAGE_KEY]: expired });
    const backend = createSupabaseAuthBackend({
      supabaseUrl: "http://127.0.0.1:9", // nothing listens here: every request fails
      publishableKey: "sb_publishable_test",
      storage,
    });
    expect(await backend.currentSession()).not.toBeNull();
    const started = Date.now();
    await backend.signOutLocal();
    expect(Date.now() - started).toBeLessThan(REVOKE_TIMEOUT_MS + 2000); // bounded, never hangs
    expect(await backend.currentSession()).toBeNull();
    expect(storage.data.has(SESSION_STORAGE_KEY)).toBe(false);
  }, 20_000);
});
