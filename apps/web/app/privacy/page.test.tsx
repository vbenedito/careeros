import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import PrivacyPage from "./page";

function textFor(storeVersion: string | undefined): string {
  vi.stubEnv("EXTENSION_STORE_VERSION", storeVersion);
  return renderToStaticMarkup(<PrivacyPage />)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
}
// The extension in the store tracks problems (0.3.0): the full copy.
const text = textFor("0.3.0");
const before = textFor("0.2.3");
const withNeetCode = textFor("0.3.1");
const withRules = textFor("0.4.0");
afterEach(() => vi.unstubAllEnvs());

describe("privacy page and the problem slug (SEC-13, PRB-15)", () => {
  it("SEC-13 PRB-15 says the problem name from LeetCode addresses is stored, with an example", () => {
    expect(text).toContain("Track LeetCode problems");
    expect(text).toContain("two-sum");
    expect(text).toContain("The rest of the address is never stored or sent");
  });

  it("SEC-13 says the feature is off by default", () => {
    expect(text).toContain("is off until you turn it on");
  });

  it("SEC-13 the deletion sentence reads well while the feature is live", () => {
    expect(text).toContain(
      "Delete account removes your account and all study data, including problem names",
    );
  });

  it("SEC-13 says turning it off stops new names and can delete the history, keeping study time", () => {
    expect(text).toContain("Turning it off stops new problem names");
    expect(text).toContain("delete your whole problem history");
    expect(text).toContain("Your study time stays either way");
    expect(text).toContain("problem names stay until you delete your account");
  });

  it("SEC-13 lists the localStorage flag of the announcement card as a browser-only preference", () => {
    expect(text).toContain("localStorage");
    expect(text).toContain("announcement");
    expect(text).toContain("stays in that browser");
  });

  it("SEC-13 PRB-15 no longer claims that no part of an address is ever recorded", () => {
    expect(text).not.toContain("The extension never records full addresses");
    expect(text).toContain("Apart from the LeetCode problem name");
  });

  it("PRB-22 SEC-13 store 0.3.0: LeetCode-only text, nothing about NeetCode", () => {
    expect(text).not.toContain("NeetCode");
    expect(text).not.toContain("neetcode");
    expect(text).not.toContain("coding problems");
    expect(text).toContain("Last updated November 18, 2026");
  });

  it("PRB-22 SEC-13 PRB-15 store 0.3.1: the approved table row, section title and paragraph", () => {
    expect(withNeetCode).toContain(
      "Only if you turn on Track coding problems: the problem name in a LeetCode or NeetCode address (for example two-sum), saved with the study period",
    );
    expect(withNeetCode).toContain("Showing your time per problem");
    expect(withNeetCode).toContain("Coding problems (LeetCode and NeetCode)");
    expect(withNeetCode).toContain(
      "Track coding problems is off until you turn it on in Settings. When it is on, the extension reads the problem name from the address of a leetcode.com or neetcode.io tab (for example two-sum in leetcode.com/problems/two-sum/) and saves only that name with your study time. Only these two sites count: lookalike addresses, such as neetcode.io.example.com, never do. The rest of the address is never stored or sent.",
    );
    expect(withNeetCode).toContain("Apart from the problem name described below,");
    expect(withNeetCode).not.toContain("Apart from the LeetCode problem name");
  });

  it("PRB-22 SEC-13 store 0.3.1: the old label is gone, the rest of the copy stays", () => {
    expect(withNeetCode).not.toContain("Track LeetCode problems");
    expect(withNeetCode).toContain(
      "Turning off Track coding problems lets you delete only the problem names",
    );
    expect(withNeetCode).toContain("Turning it off stops new problem names");
    expect(withNeetCode).toContain("announcement about coding problems");
    expect(withNeetCode).toContain("Last updated November 20, 2026");
  });

  it("PRB-23 SEC-13 while the store has 0.2.3, missing or invalid version, the problem copy is gone", () => {
    for (const hidden of [before, textFor(undefined), textFor("nope")]) {
      expect(hidden).not.toContain("Track LeetCode problems");
      expect(hidden).not.toContain("LeetCode problems");
      expect(hidden).not.toContain("two-sum");
      expect(hidden).not.toContain("localStorage");
      expect(hidden).not.toContain("problem name");
      expect(hidden).toContain("Nothing else. The extension never records full addresses");
      expect(hidden).toContain(
        "Delete account removes your account and all study data immediately",
      );
    }
  });
});

describe("privacy page and problem sites (SEC-13, PSR-18)", () => {
  it("SEC-13 PSR-18 store 0.4.0: the sites you add, the example address is not stored, the advice", () => {
    expect(withRules).toContain("Problem sites you add");
    expect(withRules).toContain("The address you paste is not stored, not sent and not logged");
    expect(withRules).toContain("the problem id (one part of the address)");
    expect(withRules).toContain(
      "Only add pages where the address names a problem. Do not add pages whose address names a person, an account or a private link (for example a profile page or a shared document): CareerOS would store that part of the address as the problem id. You can remove a problem site and its history at any time.",
    );
    expect(withRules).toContain("Apart from the problem name or id described below,");
    expect(withRules).toContain("Last updated November 28, 2026");
  });

  it("SEC-13 ENV-05c before 0.4.0 or with the version unset the text is as it was", () => {
    for (const earlier of [withNeetCode, text, before, textFor(undefined)]) {
      expect(earlier).not.toContain("Problem sites you add");
      expect(earlier).not.toContain("problem sites you add");
      expect(earlier).not.toContain("problem name or id");
    }
    expect(withNeetCode).toContain("Last updated November 20, 2026");
  });
});
