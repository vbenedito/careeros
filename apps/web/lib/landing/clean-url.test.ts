import { describe, expect, it } from "vitest";
import { cleanLandingSearch } from "./clean-url";

describe("cleanLandingSearch (SEC-15, LAND-01)", () => {
  it("SEC-15 leaves clean URLs alone", () => {
    expect(cleanLandingSearch("")).toBeNull();
    expect(cleanLandingSearch("?utm_source=x&utm_campaign=launch")).toBeNull();
  });

  it("SEC-15 drops every non-utm parameter and keeps the utm_* ones", () => {
    expect(cleanLandingSearch("?code=secret")).toBe("");
    expect(cleanLandingSearch("?error_description=a%20b&error=x")).toBe("");
    expect(cleanLandingSearch("?utm_source=x&ref=me&utm_medium=y")).toBe(
      "?utm_source=x&utm_medium=y",
    );
    expect(cleanLandingSearch("?view=week")).toBe("");
  });
});
