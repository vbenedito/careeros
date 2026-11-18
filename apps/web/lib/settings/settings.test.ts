import { describe, expect, it } from "vitest";
import { afterDeleteRequest, providerLabel } from "./account";
import { siteErrorMessage } from "./sites";

describe("settings copy (DASH-12, DASH-14)", () => {
  it("DASH-14 provider names", () => {
    expect(providerLabel("github")).toBe("GitHub");
    expect(providerLabel("google")).toBe("Google");
    expect(providerLabel("email")).toBeNull();
    expect(providerLabel(undefined)).toBeNull();
  });

  it("DASH-12 error codes map to messages; no response means offline", () => {
    expect(siteErrorMessage("INVALID_DOMAIN", 400)).toMatch(/website address/);
    expect(siteErrorMessage(undefined, null)).toMatch(/Couldn't reach/);
    expect(siteErrorMessage(undefined, 500)).toMatch(/Something went wrong/);
  });
});

describe("limit message (ENT-07, ENT-09)", () => {
  it("ENT-09 the message says the number from the server's error", () => {
    expect(siteErrorMessage("LIMIT_REACHED", 422, 12)).toBe(
      "You can track up to 12 sites. Remove one to add another.",
    );
    expect(siteErrorMessage("LIMIT_REACHED", 422, 20)).toContain("up to 20 sites");
  });

  it("ENT-07 without a number from the server the message has none and names no paid plan", () => {
    const message = siteErrorMessage("LIMIT_REACHED", 422);
    expect(message).not.toMatch(/\d/);
    expect(message).not.toMatch(/plan|upgrade|paid/i);
  });
});

describe("afterDeleteRequest (#78)", () => {
  const res = (status: number, url = "", redirected = false) => ({ status, url, redirected });

  it("AUTH-03 the API's JSON 401 (expired session) goes to sign-in, then back to the section", () => {
    expect(afterDeleteRequest(res(401))).toBe("/sign-in?next=%2Fsettings%23delete-account");
  });

  it("DASH-14 a deleted account follows the route's redirect to /sign-in?deleted=1", () => {
    expect(afterDeleteRequest(res(200, "https://app.test/sign-in?deleted=1", true))).toBe(
      "/sign-in?deleted=1",
    );
  });

  it("AUTH-14 a refusal returns to Settings with the fragment a fetch drops", () => {
    expect(afterDeleteRequest(res(200, "https://app.test/settings?error=reauth", true))).toBe(
      "/settings?error=reauth#delete-account",
    );
  });

  it("anything else is not a usable answer", () => {
    expect(afterDeleteRequest(res(403, "https://app.test/api/account/delete"))).toBeNull();
    expect(afterDeleteRequest(res(500))).toBeNull();
  });
});
