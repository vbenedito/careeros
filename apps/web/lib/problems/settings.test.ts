import { describe, expect, it } from "vitest";
import {
  EXTENSION_FOLLOWS_NOTE,
  isProblemDomainTracked,
  ProblemSettingRequestSchema,
  problemSettingErrorMessage,
  switchAction,
} from "./settings";

describe("problem setting switch (PRB-16)", () => {
  it("PRB-16 turning off with stored slugs asks first", () => {
    expect(switchAction(true, true)).toBe("ask");
  });

  it("PRB-16 turning off without stored slugs needs no dialog", () => {
    expect(switchAction(true, false)).toBe("turn-off");
  });

  it("PRB-01 turning on never asks, whatever is stored", () => {
    expect(switchAction(false, false)).toBe("turn-on");
    expect(switchAction(false, true)).toBe("turn-on");
  });
});

describe("PUT /api/settings/problems body (DASH-16)", () => {
  const parse = (body: unknown) => ProblemSettingRequestSchema.safeParse(body).success;

  it("DASH-16 accepts enabled with or without deleteHistory", () => {
    expect(parse({ enabled: true })).toBe(true);
    expect(parse({ enabled: false })).toBe(true);
    expect(parse({ enabled: false, deleteHistory: true })).toBe(true);
    expect(parse({ enabled: false, deleteHistory: false })).toBe(true);
    expect(parse({ enabled: true, deleteHistory: false })).toBe(true);
  });

  it("DASH-16 deleteHistory true with enabled true is refused", () => {
    expect(parse({ enabled: true, deleteHistory: true })).toBe(false);
  });

  it("DASH-16 anything else is refused: missing or wrong types, extra keys", () => {
    for (const body of [null, {}, { enabled: "yes" }, { deleteHistory: true }, { enabled: 1 }]) {
      expect(parse(body)).toBe(false);
    }
    expect(parse({ enabled: true, extra: 1 })).toBe(false);
    expect(parse({ enabled: false, deleteHistory: "true" })).toBe(false);
  });
});

describe("Settings card text (DASH-16, PRB-03, PRB-05)", () => {
  it("PRB-03 DASH-16 says the extension follows within about 5 minutes", () => {
    expect(EXTENSION_FOLLOWS_NOTE).toContain("about 5 minutes");
  });

  it("DASH-16 the feature needs leetcode.com itself in the tracked sites (PRB-05)", () => {
    expect(isProblemDomainTracked(["leetcode.com", "neetcode.io"])).toBe(true);
    expect(isProblemDomainTracked(["neetcode.io"])).toBe(false);
    expect(isProblemDomainTracked(["www.leetcode.com"])).toBe(false);
    expect(isProblemDomainTracked([])).toBe(false);
  });

  it("DASH-16 error messages: offline, signed out, other", () => {
    expect(problemSettingErrorMessage(undefined, null)).toMatch(/Couldn't reach/);
    expect(problemSettingErrorMessage("NOT_AUTHENTICATED", 401)).toMatch(/Sign in again/);
    expect(problemSettingErrorMessage("INTERNAL", 500)).toMatch(/Try again/);
  });
});
