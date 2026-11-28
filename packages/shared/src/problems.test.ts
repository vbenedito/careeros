import { describe, expect, it } from "vitest";
import {
  isProblemDomain,
  isValidProblemSlug,
  type ProblemRule,
  problemIdFromUrl,
  problemSlugFromUrl,
  proposeProblemRule,
} from "./problems";

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

const HI: ProblemRule = {
  domain: "hellointerview.com",
  prefix: ["practice", "system-design"],
  kind: "id",
};
const HI_URL = "https://www.hellointerview.com/practice/system-design/cmlz26cxp08st08adxvy89hr1";
const HI_ID = "cmlz26cxp08st08adxvy89hr1";
const TRACKED = ["hellointerview.com", "leetcode.com", "app.example.com", "example.com"];

describe("problem rule matcher (PSR-05..09, PSR-17)", () => {
  it("PSR-07 PSR-08 the id of the example URL is kept and ?q= never is", () => {
    const url = `${HI_URL}?q=non-functional-requirements#top`;
    expect(problemIdFromUrl(url, "hellointerview.com", [HI])).toBe(HI_ID);
    expect(problemIdFromUrl(`${HI_URL}/notes`, "hellointerview.com", [HI])).toBe(HI_ID);
    // The query is never read: a rule cannot take its value even by accident.
    expect(
      problemIdFromUrl(
        "https://hellointerview.com/practice/system-design/?q=abc123",
        "hellointerview.com",
        [HI],
      ),
    ).toBeNull();
  });

  it("PSR-06 PSR-07 literal prefix, case, encoding and missing id give no problem", () => {
    const at = (path: string) =>
      problemIdFromUrl(`https://hellointerview.com${path}`, "hellointerview.com", [HI]);
    expect(at("/practice/system-design")).toBeNull();
    expect(at("/practice/behavioral/abc123")).toBeNull();
    expect(at("/Practice/system-design/abc123")).toBeNull();
    expect(at("/practice/system-design/abc%20123")).toBeNull();
    expect(at("/practice/system-design/Abc_123")).toBe("Abc_123"); // never lowercased
    expect(at("/practice//system-design/abc123")).toBe("abc123"); // empty segments dropped
    expect(at("/x/practice/system-design/abc123")).toBeNull();
  });

  it("PSR-07 an id over 64 characters is refused and never trimmed", () => {
    const at = (id: string) =>
      problemIdFromUrl(
        `https://hellointerview.com/practice/system-design/${id}`,
        "hellointerview.com",
        [HI],
      );
    expect(at("a".repeat(64))).toBe("a".repeat(64));
    expect(at("a".repeat(65))).toBeNull();
  });

  it("PSR-07 a slug rule gives no id over 64 characters (the database limit of user domains)", () => {
    const rule: ProblemRule = { domain: "example.com", prefix: ["p"], kind: "slug" };
    const at = (id: string) =>
      problemIdFromUrl(`https://example.com/p/${id}`, "example.com", [rule]);
    expect(at("a".repeat(70))).toBeNull();
    expect(at("a".repeat(64))).toBe("a".repeat(64));
    expect(at("Abc")).toBeNull(); // the slug pattern still applies
  });

  it("PSR-05 lookalike hosts and a differently tracked subdomain give no id", () => {
    const path = "/practice/system-design/abc123";
    for (const [host, tracked] of [
      ["hellointerview.com.evil.com", null],
      ["nothellointerview.com", null],
      ["hellointerview.co", null],
      ["hellointerview.com.evil.com", "hellointerview.com.evil.com"],
      ["app.hellointerview.com", "app.hellointerview.com"], // tracked as another site
    ] as const) {
      expect(problemIdFromUrl(`https://${host}${path}`, tracked, [HI]), host).toBeNull();
    }
    expect(
      problemIdFromUrl(`https://www.hellointerview.com${path}`, "hellointerview.com", [HI]),
    ).toBe("abc123");
  });

  it("PSR-05 a rule on app.example.com does not apply to example.com", () => {
    const rule: ProblemRule = { domain: "app.example.com", prefix: ["p"], kind: "id" };
    expect(problemIdFromUrl("https://app.example.com/p/a1", "app.example.com", [rule])).toBe("a1");
    expect(problemIdFromUrl("https://example.com/p/a1", "example.com", [rule])).toBeNull();
  });

  it("PSR-09 the longest matching prefix wins", () => {
    const short: ProblemRule = { domain: "example.com", prefix: ["p"], kind: "id" };
    const long: ProblemRule = { domain: "example.com", prefix: ["p", "sets"], kind: "id" };
    const url = "https://example.com/p/sets/abc123/other";
    expect(problemIdFromUrl(url, "example.com", [short, long])).toBe("abc123");
    expect(problemIdFromUrl(url, "example.com", [long, short])).toBe("abc123");
    expect(problemIdFromUrl("https://example.com/p/zzz/abc", "example.com", [short, long])).toBe(
      "zzz",
    );
  });

  it("PSR-04 built-in domains keep their PRB-05 result whatever the user rules say", () => {
    const evil: ProblemRule = { domain: "leetcode.com", prefix: ["problemset"], kind: "id" };
    expect(problemIdFromUrl("https://leetcode.com/problems/two-sum/", "leetcode.com", [evil])).toBe(
      "two-sum",
    );
    expect(
      problemIdFromUrl("https://leetcode.com/problemset/abc", "leetcode.com", [evil]),
    ).toBeNull();
    expect(
      problemIdFromUrl("https://www.neetcode.io/problems/Two-Sum", "neetcode.io", []),
    ).toBeNull();
  });

  it("PSR-20 no rules, no tracked domain or a non-web URL give no id", () => {
    expect(problemIdFromUrl(HI_URL, "hellointerview.com", [])).toBeNull();
    expect(problemIdFromUrl(HI_URL, null, [HI])).toBeNull();
    expect(
      problemIdFromUrl(
        "chrome://hellointerview.com/practice/system-design/a",
        "hellointerview.com",
        [HI],
      ),
    ).toBeNull();
    expect(problemIdFromUrl(undefined, "hellointerview.com", [HI])).toBeNull();
  });
});

describe("rule proposal (PSR-12 step 3, PSR-11, PSR-25)", () => {
  it("PSR-12 the example URL proposes prefix, id and the looks-random warning; the query is shown, not kept", () => {
    const r = proposeProblemRule(`${HI_URL}?q=non-functional-requirements`, TRACKED);
    expect(r).toMatchObject({
      ok: true,
      domain: "hellointerview.com",
      prefix: ["practice", "system-design"],
      kind: "id",
      id: HI_ID,
      notKept: "?q=non-functional-requirements",
      warning: { riskySegment: false, looksRandom: true },
      warn: true,
    });
    // The proposed rule matches the example URL it came from (PSR-11 round trip).
    if (r.ok) {
      expect(
        problemIdFromUrl(HI_URL, r.domain, [{ domain: r.domain, prefix: r.prefix, kind: r.kind }]),
      ).toBe(HI_ID);
    }
  });

  it("PSR-12 the last fitting segment is proposed and another can be picked", () => {
    const r = proposeProblemRule(
      "https://hellointerview.com/practice/system-design/abc123/notes",
      TRACKED,
    );
    expect(r).toMatchObject({
      ok: true,
      id: "notes",
      prefix: ["practice", "system-design", "abc123"],
    });
    const picked = proposeProblemRule(
      "https://hellointerview.com/practice/system-design/abc123/notes",
      TRACKED,
      2,
    );
    expect(picked).toMatchObject({ ok: true, id: "abc123", notKept: "/notes" });
    expect(
      proposeProblemRule(
        "https://hellointerview.com/practice/system-design/abc123/notes",
        TRACKED,
        0,
      ),
    ).toEqual({ ok: false, reason: "bad_choice" });
  });

  it("PSR-12 refuses other schemes, untracked sites and built-in sites", () => {
    expect(proposeProblemRule("ftp://hellointerview.com/a/b", TRACKED)).toEqual({
      ok: false,
      reason: "not_http",
    });
    expect(proposeProblemRule("not a url", TRACKED)).toEqual({ ok: false, reason: "not_http" });
    expect(proposeProblemRule("https://other.org/a/b", TRACKED)).toEqual({
      ok: false,
      reason: "no_tracked_domain",
    });
    expect(proposeProblemRule("https://leetcode.com/problems/two-sum", TRACKED)).toEqual({
      ok: false,
      reason: "built_in",
    });
    expect(proposeProblemRule("https://hellointerview.com/only-one", TRACKED)).toEqual({
      ok: false,
      reason: "no_candidate",
    });
  });

  it("PSR-25 personal-data examples set the risky-segment warning", () => {
    const tracked = [...TRACKED, "linkedin.com", "docs.google.com"];
    for (const url of [
      "https://example.com/u/john-doe",
      "https://www.linkedin.com/in/jane-doe",
      "https://example.com/users/12345",
      "https://docs.google.com/document/d/1AbC2dEfGhIjKlMnOpQrStUvWxYz0123456789abcdef/edit",
    ]) {
      const r = proposeProblemRule(url, tracked);
      expect(r, url).toMatchObject({ ok: true, warn: true });
      if (r.ok) expect(r.warning.riskySegment || r.warning.looksRandom, url).toBe(true);
    }
    const docs = proposeProblemRule(
      "https://example.com/document/d/1AbC2dEfGhIjKlMnOpQrStUvWxYz0123456789abcdef/edit",
      TRACKED,
    );
    expect(docs).toMatchObject({ ok: true, warning: { riskySegment: true } });
    const plain = proposeProblemRule("https://example.com/problems/two-sum", TRACKED);
    expect(plain).toMatchObject({ ok: true, warn: false });
  });

  it("PSR-25 an id over 64 characters cannot be picked", () => {
    const long = "A1".repeat(33);
    expect(proposeProblemRule(`https://example.com/d/${long}`, TRACKED)).toEqual({
      ok: false,
      reason: "no_candidate",
    });
  });
});
