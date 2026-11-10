import { describe, expect, it } from "vitest";
import { isRecentSignIn, lastSignInAt, RECENT_SIGN_IN_S } from "./recent-sign-in";

const NOW_MS = 1_800_000_000_000;
const now = NOW_MS / 1000;

describe("recent sign-in (AUTH-14)", () => {
  it("AUTH-14 uses the latest amr timestamp", () => {
    expect(
      lastSignInAt({
        amr: [
          { method: "oauth", timestamp: now - 3000 },
          { method: "oauth", timestamp: now - 30 },
        ],
      }),
    ).toBe(now - 30);
  });

  it("AUTH-14 within 10 minutes is recent; just over is not", () => {
    expect(RECENT_SIGN_IN_S).toBe(600);
    expect(isRecentSignIn({ amr: [{ method: "oauth", timestamp: now - 600 }] }, NOW_MS)).toBe(true);
    expect(isRecentSignIn({ amr: [{ method: "oauth", timestamp: now - 601 }] }, NOW_MS)).toBe(
      false,
    );
  });

  it("AUTH-14 missing, malformed or far-future amr is never recent", () => {
    expect(isRecentSignIn(null, NOW_MS)).toBe(false);
    expect(isRecentSignIn({}, NOW_MS)).toBe(false);
    expect(isRecentSignIn({ amr: ["oauth"] }, NOW_MS)).toBe(false);
    expect(isRecentSignIn({ amr: [{ method: "oauth", timestamp: "now" }] }, NOW_MS)).toBe(false);
    expect(isRecentSignIn({ amr: [{ method: "oauth", timestamp: now + 3600 }] }, NOW_MS)).toBe(
      false,
    );
    // A small clock difference is tolerated.
    expect(isRecentSignIn({ amr: [{ method: "oauth", timestamp: now + 30 }] }, NOW_MS)).toBe(true);
  });
});
