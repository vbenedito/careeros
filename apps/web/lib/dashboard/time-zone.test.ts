import { describe, expect, it } from "vitest";
import { isValidTimeZone, resolveTimeZone, todayIn } from "./time-zone";

describe("viewer time zone (DASH-07)", () => {
  it("DASH-07 accepts IANA zones and rejects anything else", () => {
    expect(isValidTimeZone("America/Sao_Paulo")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
    for (const bad of ["", "Mars/Olympus", "America/Sao_Paulo; drop", "../../etc", 42, undefined]) {
      expect(isValidTimeZone(bad)).toBe(false);
    }
    expect(resolveTimeZone("nope")).toBe("UTC");
    expect(resolveTimeZone("Asia/Kolkata")).toBe("Asia/Kolkata");
  });

  it("DASH-07 today is computed in the viewer's zone", () => {
    const instant = new Date("2026-11-08T01:30:00Z"); // Sat 22:30 in São Paulo, Sun in UTC
    expect(todayIn("America/Sao_Paulo", instant)).toBe("2026-11-07");
    expect(todayIn("UTC", instant)).toBe("2026-11-08");
  });
});
