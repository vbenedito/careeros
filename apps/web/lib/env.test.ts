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

  it("ENV-05c an invalid version counts as missing: no throw, feature hidden", () => {
    for (const value of ["latest-secret", "0.3", "v0.3.0", "0.3.0-beta"]) {
      vi.stubEnv("EXTENSION_STORE_VERSION", value);
      expect(extensionStoreVersion()).toBeNull();
      expect(() => extensionFeatureLive("problemTracking")).not.toThrow();
      expect(extensionFeatureLive("problemTracking")).toBe(false);
    }
  });

  it("ENV-05c PRB-22 the NeetCode copy is live only from store 0.3.1: unset, invalid and 0.3.0 hide it", () => {
    for (const value of [undefined, "", "nope", "0.2.3", "0.3.0"]) {
      vi.stubEnv("EXTENSION_STORE_VERSION", value);
      expect(extensionFeatureLive("problemTrackingNeetCode")).toBe(false);
    }
    vi.stubEnv("EXTENSION_STORE_VERSION", "0.3.1");
    expect(extensionFeatureLive("problemTrackingNeetCode")).toBe(true);
    vi.stubEnv("EXTENSION_STORE_VERSION", "0.4.0");
    expect(extensionFeatureLive("problemTrackingNeetCode")).toBe(true);
  });
});
