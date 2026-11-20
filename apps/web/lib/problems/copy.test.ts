import { describe, expect, it } from "vitest";
import { problemsCopy } from "./copy";

describe("problem texts and the NeetCode gate (PRB-22, ENV-05c)", () => {
  it("PRB-22 before 0.3.1 every text is the LeetCode-only text of 0.3.0", () => {
    const copy = problemsCopy(false);
    expect(copy).toEqual({
      settingLabel: "Track LeetCode problems",
      settingsTitle: "LeetCode problems",
      settingHelp:
        "Saves the problem name from LeetCode addresses (like two-sum) with your study time. Nothing else from the address.",
      needsSite: "This needs leetcode.com in your tracked sites. Add it above.",
      cardTitle: "LeetCode problems",
      cardSubtitle: null,
      cardEmpty: "No LeetCode problems in this period.",
      cardLoadTemporary:
        "Couldn't load your LeetCode problems. Your tracked time is safe. Try again in a moment.",
      cardLoadPermanent:
        "Couldn't load your LeetCode problems. Trying again won't help yet. Check back later.",
      announcement: "New: see your time per LeetCode problem.",
      showSite: false,
    });
    expect(JSON.stringify(copy)).not.toContain("NeetCode");
  });

  it("PRB-22 DASH-16 from 0.3.1 the label, help text and sites message are the approved copy", () => {
    const copy = problemsCopy(true);
    expect(copy.settingLabel).toBe("Track coding problems");
    expect(copy.settingHelp).toBe(
      "Saves the problem name from LeetCode and NeetCode addresses (like two-sum) with your study time. Nothing else from the address.",
    );
    expect(copy.needsSite).toBe(
      "This needs leetcode.com or neetcode.io in your tracked sites. Add one above.",
    );
  });

  it("PRB-11 DASH-17 DASH-18 from 0.3.1 the card is 'Coding problems', its subtitle names both sites", () => {
    const copy = problemsCopy(true);
    expect(copy.cardTitle).toBe("Coding problems");
    expect(copy.cardSubtitle).toMatch(/LeetCode and NeetCode/);
    expect(copy.announcement).toMatch(/LeetCode and NeetCode/);
    expect(copy.showSite).toBe(true);
  });
});
