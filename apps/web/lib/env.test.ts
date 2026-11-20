import { afterEach, describe, expect, it, vi } from "vitest";
import { extensionFeatureLive, extensionStoreVersion } from "./env";

afterEach(() => vi.unstubAllEnvs());

describe("EXTENSION_STORE_VERSION (ENV-05c, PRB-23)", () => {
  it("ENV-05c missing and empty: no version, every gated feature hidden", () => {
    for (const value of [undefined, "", "  "]) {
      vi.stubEnv("EXTENSION_STORE_VERSION", value);
      expect(extensionStoreVersion()).toBeNull();
      expect(extensionFeatureLive("problemTracking")).toBe(false);
    }
  });

  it("PRB-23 0.2.3 hides problem tracking; 0.3.0 and newer show it; read at call time", () => {
    vi.stubEnv("EXTENSION_STORE_VERSION", "0.2.3");
    expect(extensionFeatureLive("problemTracking")).toBe(false);
    vi.stubEnv("EXTENSION_STORE_VERSION", "0.3.0");
    expect(extensionFeatureLive("problemTracking")).toBe(true);
    vi.stubEnv("EXTENSION_STORE_VERSION", "0.3.1");
    expect(extensionFeatureLive("problemTracking")).toBe(true);
  });

  it("ENV-05c an invalid version throws and the message never contains the value", () => {
    vi.stubEnv("EXTENSION_STORE_VERSION", "latest-secret");
    expect(() => extensionFeatureLive("problemTracking")).toThrow(/EXTENSION_STORE_VERSION/);
    try {
      extensionStoreVersion();
    } catch (error) {
      expect(String(error)).not.toContain("latest-secret");
    }
  });
});
