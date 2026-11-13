import { describe, expect, it } from "vitest";
import config from "../../vitest.config";

type Floor = { lines?: number; branches?: number; functions?: number; statements?: number };
const thresholds = (config.test?.coverage?.thresholds ?? {}) as Record<string, Floor>;

describe("coverage floors (vitest.config.ts)", () => {
  it("TEST-03 sync and auth have a floor on all four metrics, engine and shared keep 90", () => {
    for (const glob of [
      "apps/extension/src/background/sync/**",
      "apps/extension/src/background/auth/**",
    ]) {
      const floor = thresholds[glob];
      expect(floor, glob).toBeDefined();
      for (const metric of ["lines", "branches", "functions", "statements"] as const) {
        expect(floor?.[metric], `${glob} ${metric}`).toBeGreaterThan(0);
      }
    }
    for (const glob of ["packages/shared/src/**", "apps/extension/src/engine/**"]) {
      expect(thresholds[glob]?.lines, glob).toBe(90);
    }
  });
});
