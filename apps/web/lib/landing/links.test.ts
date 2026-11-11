import { afterEach, describe, expect, it, vi } from "vitest";
import { extensionInstallUrl } from "./links";

afterEach(() => vi.unstubAllEnvs());

describe("landing links (LAND-05)", () => {
  it("LAND-05 the install link comes from EXTENSION_INSTALL_URL and must be https", () => {
    vi.stubEnv("EXTENSION_INSTALL_URL", "https://chromewebstore.google.com/detail/abc");
    expect(extensionInstallUrl()).toBe("https://chromewebstore.google.com/detail/abc");
    vi.stubEnv("EXTENSION_INSTALL_URL", "http://evil.example");
    expect(() => extensionInstallUrl()).toThrow();
  });

  it("LAND-05 without it, the Chrome Web Store search", () => {
    vi.stubEnv("EXTENSION_INSTALL_URL", "");
    expect(extensionInstallUrl()).toContain("chromewebstore.google.com");
  });
});

describe("build-time origin (LAND-04, LAND-07)", () => {
  it("LAND-07 SITE_URL first, then Vercel's production domain, then localhost", async () => {
    const { buildSiteUrl } = await import("@/lib/env");
    vi.stubEnv("SITE_URL", "https://careeros.example/x");
    expect(buildSiteUrl()).toBe("https://careeros.example");
    vi.stubEnv("SITE_URL", "");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "careeros-taupe.vercel.app");
    expect(buildSiteUrl()).toBe("https://careeros-taupe.vercel.app");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");
    expect(buildSiteUrl()).toBe("http://localhost:3000");
  });
});
