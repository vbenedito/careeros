import { describe, expect, it } from "vitest";
import { fakeStorage } from "../../test/fakes";
import { createSessionStorage, minimizeSession } from "./storage";

describe("createSessionStorage", () => {
  it("AUTH-10 persists the session in chrome.storage.local (not localStorage)", async () => {
    const area = fakeStorage();
    const storage = createSessionStorage(area);
    expect(await storage.getItem("k")).toBeNull();
    await storage.setItem("k", '{"access_token":"x"}');
    expect(area.data.get("k")).toBe('{"access_token":"x"}');
    expect(await storage.getItem("k")).toBe('{"access_token":"x"}');
    await storage.removeItem("k");
    expect(area.data.has("k")).toBe(false);
  });

  it("ignores non-string values written by something else", async () => {
    const storage = createSessionStorage(fakeStorage({ k: { not: "a string" } }));
    expect(await storage.getItem("k")).toBeNull();
  });
});

describe("stored session (SEC-01, #113)", () => {
  it("SEC-01 keeps only the user's id and email: no name, avatar or identities", async () => {
    const area = fakeStorage();
    const storage = createSessionStorage(area);
    await storage.setItem(
      "session",
      JSON.stringify({
        access_token: "a",
        refresh_token: "r",
        expires_at: 1,
        user: {
          id: "u1",
          aud: "authenticated",
          role: "authenticated",
          email: "a@example.test",
          user_metadata: { full_name: "Ada", avatar_url: "https://avatars.example/a.png" },
          identities: [{ provider: "github", identity_data: { email: "a@example.test" } }],
          app_metadata: { provider: "github" },
        },
      }),
    );
    const stored = JSON.parse(area.data.get("session") as string);
    expect(stored.user).toEqual({
      id: "u1",
      aud: "authenticated",
      role: "authenticated",
      email: "a@example.test",
    });
    expect(stored.refresh_token).toBe("r");
  });

  it("anything that is not a session is stored unchanged", () => {
    expect(minimizeSession("not json")).toBe("not json");
    expect(minimizeSession('{"code_verifier":"v"}')).toBe('{"code_verifier":"v"}');
    expect(minimizeSession('{"user":null}')).toBe('{"user":null}');
  });
});
