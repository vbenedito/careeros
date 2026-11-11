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
