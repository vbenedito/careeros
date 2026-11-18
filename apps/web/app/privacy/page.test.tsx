import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import PrivacyPage from "./page";

const html = renderToStaticMarkup(<PrivacyPage />);
const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("privacy page and the problem slug (SEC-13, PRB-15)", () => {
  it("SEC-13 PRB-15 says the problem name from LeetCode addresses is stored, with an example", () => {
    expect(text).toContain("Track LeetCode problems");
    expect(text).toContain("two-sum");
    expect(text).toContain("The rest of the address is never stored or sent");
  });

  it("SEC-13 says the feature is off by default", () => {
    expect(text).toContain("is off until you turn it on");
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
});
