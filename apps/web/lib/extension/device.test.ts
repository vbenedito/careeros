import { describe, expect, it } from "vitest";
import { isMobileBrowser } from "./device";

const UA = {
  android:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36",
  // Android tablets drop "Mobile" from the user agent and report mobile: false in Client Hints.
  tablet:
    "Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36",
  iphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36",
};

describe("phones and tablets (DASH-11, DASH-13)", () => {
  it("DASH-11 Client Hints mark phones; Android tablets (mobile: false) are caught by the user agent", () => {
    expect(isMobileBrowser({ userAgent: UA.mac, userAgentData: { mobile: true } })).toBe(true);
    expect(isMobileBrowser({ userAgent: UA.tablet, userAgentData: { mobile: false } })).toBe(true);
    expect(isMobileBrowser({ userAgent: UA.mac, userAgentData: { mobile: false } })).toBe(false);
  });

  it("DASH-11 without Client Hints: Android and iPhone are mobile, desktop Chrome is not", () => {
    expect(isMobileBrowser({ userAgent: UA.android })).toBe(true);
    expect(isMobileBrowser({ userAgent: UA.iphone })).toBe(true);
    expect(isMobileBrowser({ userAgent: UA.mac })).toBe(false);
  });
});
