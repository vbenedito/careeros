import { describe, expect, it } from "vitest";
import { isProblemDomain, isValidProblemSlug, problemSlugFromUrl } from "./problems";

describe("problem slug (PRB-05, PRB-06)", () => {
  it.each([
    ["https://leetcode.com/problems/two-sum/", "two-sum"],
    ["https://www.leetcode.com/problems/two-sum/description/?envType=x#top", "two-sum"],
    ["https://leetcode.com/problems/two-sum/submissions/123/", "two-sum"],
    ["https://leetcode.com/problems/3sum", "3sum"],
  ])("PRB-05 %s gives %s", (url, slug) => {
    expect(problemSlugFromUrl(url, "leetcode.com")).toBe(slug);
  });

  it.each([
    "https://leetcode.com/problemset/",
    "https://leetcode.com/contest/weekly-contest-400/problems/two-sum/",
    "https://leetcode.com/problems/Two-Sum/",
    "https://leetcode.com/problems/two--sum/",
    "https://leetcode.com/problems/",
    "https://leetcode.com/problems//two-sum/",
    "https://leetcode.com/problems/-two-sum/",
    "https://leetcode.com/?next=/problems/two-sum/",
    `https://leetcode.com/problems/${"a".repeat(101)}/`,
    "ftp://leetcode.com/problems/two-sum/",
    "not a url",
  ])("PRB-05 %s gives no problem (never repaired)", (url) => {
    expect(problemSlugFromUrl(url, "leetcode.com")).toBeNull();
  });

  it("PRB-05 only for a tab matched to the tracked domain leetcode.com itself", () => {
    const url = "https://leetcode.cn/problems/two-sum/";
    expect(problemSlugFromUrl(url, "leetcode.cn")).toBeNull();
    expect(
      problemSlugFromUrl("https://notleetcode.com/problems/two-sum/", "notleetcode.com"),
    ).toBeNull();
    expect(
      problemSlugFromUrl("https://assets.leetcode.com/problems/x/", "assets.leetcode.com"),
    ).toBeNull();
    expect(problemSlugFromUrl("https://leetcode.com/problems/two-sum/", null)).toBeNull();
    expect(problemSlugFromUrl(undefined, "leetcode.com")).toBeNull();
  });

  it("PRB-05 the slug length limit is PROBLEM_SLUG_MAX", () => {
    expect(isValidProblemSlug("a".repeat(100))).toBe(true);
    expect(isValidProblemSlug("a".repeat(101))).toBe(false);
  });
});

describe("NeetCode and the problem domain list (PRB-05, PRB-18, PRB-19)", () => {
  it.each([
    "https://www.neetcode.io/problems/two-integer-sum/question",
    "https://neetcode.io/problems/two-integer-sum",
    "https://neetcode.io/problems/two-integer-sum/solution",
  ])("PRB-05 acceptance 8 %s gives two-integer-sum on neetcode.io", (url) => {
    expect(problemSlugFromUrl(url, "neetcode.io")).toBe("two-integer-sum");
  });

  it.each([
    ["https://neetcode.io.evil.com/problems/two-integer-sum/question", "neetcode.io.evil.com"],
    ["https://notneetcode.io/problems/two-integer-sum/question", "notneetcode.io"],
    ["https://neetcode.com/problems/two-integer-sum/question", "neetcode.com"],
    ["https://app.neetcode.io/problems/two-integer-sum/question", "app.neetcode.io"],
  ])("PRB-05 acceptance 9 lookalike %s (tracked as %s) gives no problem", (url, tracked) => {
    expect(problemSlugFromUrl(url, tracked)).toBeNull();
  });

  it("PRB-05 acceptance 9 PRB-18 a tab matched to no tracked domain gives no problem", () => {
    expect(problemSlugFromUrl("https://neetcode.io/problems/two-integer-sum/", null)).toBeNull();
  });

  it("PRB-05 an uppercase NeetCode slug gives no problem", () => {
    expect(
      problemSlugFromUrl("https://neetcode.io/problems/Two-Integer-Sum/question", "neetcode.io"),
    ).toBeNull();
  });

  it("PRB-18 isProblemDomain is exactly PROBLEM_DOMAINS", () => {
    expect(isProblemDomain("leetcode.com")).toBe(true);
    expect(isProblemDomain("neetcode.io")).toBe(true);
    for (const d of [
      "www.neetcode.io",
      "app.neetcode.io",
      "neetcode.com",
      "leetcode.cn",
      "",
      null,
    ]) {
      expect(isProblemDomain(d), String(d)).toBe(false);
    }
  });
});
