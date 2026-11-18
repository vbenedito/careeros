import { describe, expect, it } from "vitest";
import { ANNOUNCEMENT_KEY, dismissAnnouncement, isAnnouncementDismissed } from "./announcement";

const memory = () => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
};

const broken = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
};

describe("announcement dismissal flag (DASH-18)", () => {
  it("DASH-18 a dismissed card stays dismissed in this browser", () => {
    const storage = memory();
    expect(isAnnouncementDismissed(storage)).toBe(false);
    dismissAnnouncement(storage);
    expect(storage.data.get(ANNOUNCEMENT_KEY)).toBe("1");
    expect(isAnnouncementDismissed(storage)).toBe(true);
  });

  it("DASH-18 storage that throws or is missing counts as not dismissed, and never throws", () => {
    expect(isAnnouncementDismissed(broken)).toBe(false);
    expect(isAnnouncementDismissed(undefined)).toBe(false);
    expect(() => dismissAnnouncement(broken)).not.toThrow();
    expect(() => dismissAnnouncement(undefined)).not.toThrow();
  });
});
