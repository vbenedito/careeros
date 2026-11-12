import { DATA } from "@careeros/shared";
import { describe, expect, it } from "vitest";
import { providerLabel } from "./account";
import { siteErrorMessage } from "./sites";

describe("settings copy (DASH-12, DASH-14)", () => {
  it("DASH-14 provider names", () => {
    expect(providerLabel("github")).toBe("GitHub");
    expect(providerLabel("google")).toBe("Google");
    expect(providerLabel("email")).toBeNull();
    expect(providerLabel(undefined)).toBeNull();
  });

  it("DASH-12 error codes map to messages; no response means offline", () => {
    expect(siteErrorMessage("LIMIT_REACHED", 422)).toBe(
      `You can track up to ${DATA.MAX_TRACKED_DOMAINS} sites. Remove one to add another.`,
    );
    expect(siteErrorMessage("INVALID_DOMAIN", 400)).toMatch(/website address/);
    expect(siteErrorMessage(undefined, null)).toMatch(/Couldn't reach/);
    expect(siteErrorMessage(undefined, 500)).toMatch(/Something went wrong/);
  });
});
