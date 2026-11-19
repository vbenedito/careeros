import { describe, expect, it } from "vitest";
import { z } from "zod";
import "./zod-config";

describe("zod config (EXT-UI-05d)", () => {
  it("EXT-UI-05d the extension runs Zod jitless, so it never probes with new Function", () => {
    expect(z.config().jitless).toBe(true);
  });
});
