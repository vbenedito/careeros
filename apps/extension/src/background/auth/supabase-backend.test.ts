import {
  AuthApiError,
  AuthRetryableFetchError,
  AuthSessionMissingError,
} from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeStorage } from "../../test/fakes";
import { SESSION_STORAGE_KEY } from "./storage";
import {
  createSupabaseAuthBackend,
  REVOKE_TIMEOUT_MS,
  refreshFailureReason,
} from "./supabase-backend";

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

describe("refresh failures (AUTH-11)", () => {
  it.each([
    [400, "refresh_token_not_found"],
    [403, "bad_jwt"],
    [404, "user_not_found"],
  ])("AUTH-11 %i %s: the session is gone", (status, code) => {
    expect(refreshFailureReason(new AuthApiError("x", status, code))).toBe("invalid");
  });

  it.each([429, 408, 500])("AUTH-11 %i is temporary: stay connected", (status) => {
    expect(refreshFailureReason(new AuthApiError("x", status, undefined))).toBe("unavailable");
  });

  it("AUTH-11 a missing session (what supabase-js raises for session_not_found) is gone", () => {
    expect(refreshFailureReason(new AuthSessionMissingError())).toBe("invalid");
  });

  it("AUTH-11 network failures and unknown errors are temporary", () => {
    expect(refreshFailureReason(new AuthRetryableFetchError("offline", 0))).toBe("unavailable");
    expect(refreshFailureReason(new Error("boom"))).toBe("unavailable");
    expect(refreshFailureReason(null)).toBe("unavailable");
  });
});

describe("refresh against a rate-limited server (AUTH-11)", () => {
  afterEach(() => vi.unstubAllGlobals());

  const stored = (expiresAt: number) =>
    JSON.stringify({
      access_token: "a",
      refresh_token: "r",
      expires_at: expiresAt,
      token_type: "bearer",
      user: { id: "00000000-0000-4000-8000-000000000001", email: "a@example.test" },
    });

  async function refreshWith429(expiresAt: number) {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ code: "over_request_rate_limit", msg: "slow down" }), {
            status: 429,
            headers: { "content-type": "application/json" },
          }),
      ),
    );
    const storage = fakeStorage({ [SESSION_STORAGE_KEY]: stored(expiresAt) });
    const backend = createSupabaseAuthBackend({
      supabaseUrl: "http://127.0.0.1:9",
      publishableKey: "sb_publishable_test",
      storage,
    });
    return { result: await backend.refresh(), backend };
  }

  it("AUTH-11 token still valid: 429 is temporary and the session is kept", async () => {
    const { result, backend } = await refreshWith429(Math.floor(Date.now() / 1000) + 600);
    expect(result).toEqual({ ok: false, reason: "unavailable" });
    expect(await backend.currentSession()).not.toBeNull();
  });

  it("AUTH-10a token expired: a 429 is still temporary and the session is kept (#58)", async () => {
    // supabase-js logs the mocked 429 ("AuthApiError: slow down") with console.error. Kept out
    // of the CI log (#82), where it read like a real rate-limit failure of the local stack.
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const { result, backend } = await refreshWith429(1);
      expect(result).toEqual({ ok: false, reason: "unavailable" });
      expect(await backend.currentSession()).not.toBeNull();
    } finally {
      logged.mockRestore();
    }
  });

  it("AUTH-11 token expired and the refresh token is rejected (400): the session is gone", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ code: "refresh_token_not_found", msg: "Invalid Refresh Token" }),
            { status: 400, headers: { "content-type": "application/json" } },
          ),
      ),
    );
    const storage = fakeStorage({ [SESSION_STORAGE_KEY]: stored(1) });
    const backend = createSupabaseAuthBackend({
      supabaseUrl: "http://127.0.0.1:9",
      publishableKey: "sb_publishable_test",
      storage,
    });
    expect(await backend.refresh()).toEqual({ ok: false, reason: "invalid" });
    expect(storage.data.has(SESSION_STORAGE_KEY)).toBe(false);
  });
});
