import { describe, expect, it } from "vitest";
import { problemName } from "./problem-name";

describe("problemName (PRB-12)", () => {
  it("PRB-12 the spec examples", () => {
    expect(problemName("two-sum")).toBe("Two Sum");
    expect(problemName("3sum")).toBe("3sum");
    expect(problemName("lru-cache")).toBe("Lru Cache");
  });

  it("PRB-12 only the first character of each part changes; the rest is kept", () => {
    expect(problemName("add-two-numbers-ii")).toBe("Add Two Numbers Ii");
    expect(problemName("n-queens")).toBe("N Queens");
    expect(problemName("sqrtx")).toBe("Sqrtx");
  });

  it("PRB-12 a digit-first part is unchanged and parts join with exactly one space", () => {
    expect(problemName("4sum-ii")).toBe("4sum Ii");
    expect(problemName("a")).toBe("A");
  });
});
