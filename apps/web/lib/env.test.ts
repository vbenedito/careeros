import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { extensionFeatureLive, extensionStoreVersion, githubApiBase } from "./env";

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

describe("OPS_GITHUB_API_STUB (TEST-01, #232)", () => {
  const REAL = "https://api.github.com";
  beforeEach(() => vi.stubEnv("CI", "true"));

  it("TEST-01 without CI the stub is ignored", () => {
    vi.stubEnv("OPS_GITHUB_API_STUB", "http://127.0.0.1:4010");
    vi.stubEnv("CI", "");
    expect(githubApiBase(REAL)).toBe(REAL);
  });

  it("TEST-01 unset, empty or invalid: the real API", () => {
    for (const value of [undefined, "", "  ", "not a url"]) {
      vi.stubEnv("OPS_GITHUB_API_STUB", value);
      expect(githubApiBase(REAL)).toBe(REAL);
    }
  });

  it("TEST-01 only plain http on 127.0.0.1 with a port is used", () => {
    vi.stubEnv("OPS_GITHUB_API_STUB", "http://127.0.0.1:4010/anything");
    expect(githubApiBase(REAL)).toBe("http://127.0.0.1:4010");
    for (const value of [
      "https://127.0.0.1:4010",
      "http://127.0.0.1",
      "http://localhost:4010",
      "http://evil.example:4010",
      "http://127.0.0.1.evil.example:4010",
    ]) {
      vi.stubEnv("OPS_GITHUB_API_STUB", value);
      expect(githubApiBase(REAL)).toBe(REAL);
    }
  });

  it("TEST-01 never on Vercel: any VERCEL_ENV turns the stub off", () => {
    vi.stubEnv("OPS_GITHUB_API_STUB", "http://127.0.0.1:4010");
    for (const env of ["production", "preview", "development"]) {
      vi.stubEnv("VERCEL_ENV", env);
      expect(githubApiBase(REAL)).toBe(REAL);
    }
  });
});
