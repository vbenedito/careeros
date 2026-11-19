import { describe, expect, it } from "vitest";
import { errorMessage, validLimit } from "./messages";

describe("site limit message (ENT-07, ENT-09)", () => {
  it("ENT-07 only a positive integer is taken from the reply; anything else is no number", () => {
    for (const bad of [0, -3, 1.5, "25", null, undefined, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(validLimit(bad)).toBeUndefined();
    }
    expect(validLimit(25)).toBe(25);
    expect(validLimit(1)).toBe(1);
  });

  it("ENT-09 the message says the number from the error", () => {
    expect(errorMessage("LIMIT_REACHED", validLimit(25))).toBe("You can track up to 25 sites.");
    expect(errorMessage("LIMIT_REACHED", validLimit(1))).toBe("You can track up to 1 site.");
  });

  it("ENT-07 a missing or invalid number gives the message without one", () => {
    for (const bad of [0, 1.5, "25", undefined]) {
      expect(errorMessage("LIMIT_REACHED", validLimit(bad))).toBe("You've reached the site limit.");
    }
  });
});
