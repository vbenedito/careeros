import { describe, expect, it } from "vitest";
import { fakeStorage } from "../../test/fakes";
import { createSessionStorage } from "./storage";

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
