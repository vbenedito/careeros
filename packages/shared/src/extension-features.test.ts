import { describe, expect, it } from "vitest";
import {
  EXTENSION_FEATURES,
  isExtensionFeatureLive,
  parseExtensionVersion,
  versionAtLeast,
} from "./extension-features";

describe("ENV-05c extension feature gate", () => {
  it("ENV-05c parses only strict major.minor.patch", () => {
    expect(parseExtensionVersion("0.2.3")).toEqual([0, 2, 3]);
    expect(parseExtensionVersion(" 10.20.30 ")).toEqual([10, 20, 30]);
    for (const bad of [
      undefined,
      null,
      "",
      "0.3",
      "0.3.0.1",
      "v0.3.0",
      "0.3.0-beta",
      "a.b.c",
      "1.-1.0",
    ]) {
      expect(parseExtensionVersion(bad)).toBeNull();
    }
  });

  it("ENV-05c compares numerically, not as text", () => {
    expect(versionAtLeast("0.3.0", "0.3.0")).toBe(true);
    expect(versionAtLeast("0.10.0", "0.9.9")).toBe(true);
    expect(versionAtLeast("0.2.3", "0.3.0")).toBe(false);
    expect(versionAtLeast("1.0.0", "0.99.99")).toBe(true);
    expect(versionAtLeast("0.3.1", "0.3.2")).toBe(false);
  });

  it("ENV-05c PRB-18 NeetCode problem tracking needs extension 0.3.1", () => {
    expect(EXTENSION_FEATURES.problemTrackingNeetCode).toBe("0.3.1");
    expect(isExtensionFeatureLive("problemTrackingNeetCode", "0.3.0")).toBe(false);
    expect(isExtensionFeatureLive("problemTrackingNeetCode", "0.3.1")).toBe(true);
    expect(isExtensionFeatureLive("problemTrackingNeetCode", undefined)).toBe(false);
  });

  it("ENV-05c PRB-23 problem tracking is live from 0.3.0; missing or invalid hides it", () => {
    expect(EXTENSION_FEATURES.problemTracking).toBe("0.3.0");
    expect(isExtensionFeatureLive("problemTracking", "0.2.3")).toBe(false);
    expect(isExtensionFeatureLive("problemTracking", "0.3.0")).toBe(true);
    expect(isExtensionFeatureLive("problemTracking", "0.3.1")).toBe(true);
    for (const bad of [undefined, null, "", "nope"]) {
      expect(isExtensionFeatureLive("problemTracking", bad)).toBe(false);
    }
  });
});
