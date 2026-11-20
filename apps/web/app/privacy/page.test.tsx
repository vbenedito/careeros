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
