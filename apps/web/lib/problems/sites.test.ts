import { ENTITLEMENTS, proposeProblemRule } from "@careeros/shared";
import { describe, expect, it } from "vitest";
import {
  AddProblemRuleRequestSchema,
  canAddRule,
  labelToSend,
  previewLines,
  problemSiteErrorMessage,
  problemSiteRules,
  proposalFailure,
  RemoveProblemRuleRequestSchema,
  removeNeedsDialog,
  ruleAddress,
  ruleLabels,
  SITE_COPY,
  shortenMiddle,
} from "./sites";

const URL_EXAMPLE =
  "https://www.hellointerview.com/learn/system-design/practice/cmlz26cxp08st08adxvy89hr1?q=non-functional-requirements";
const rule = {
  domain: "hellointerview.com",
  prefix: ["learn", "system-design", "practice"],
  kind: "id",
  label: "System design",
  confirmedProblemId: true,
};

describe("PSR-11 the request carries a rule, never an address", () => {
  it("PSR-11 accepts a rule and refuses a url, a query or any extra field", () => {
    expect(AddProblemRuleRequestSchema.safeParse(rule).success).toBe(true);
    for (const extra of [{ url: URL_EXAMPLE }, { query: "q=1" }, { fragment: "x" }, { id: "x" }]) {
      expect(AddProblemRuleRequestSchema.safeParse({ ...rule, ...extra }).success).toBe(false);
    }
  });
});

describe("PSR-16 the shared rule schema checks the request", () => {
  it("PSR-16 refuses a built-in domain, bad segments, a bad domain and a long label", () => {
    const bad = [
      { domain: "leetcode.com" },
      { prefix: [] },
      { prefix: ["a", "b", "c", "d"] },
      { prefix: ["Has Space"] },
      { prefix: ["a?q=1"] },
      { domain: "https://hellointerview.com/x" },
      { kind: "slug" },
      { label: "x".repeat(41) },
    ];
    for (const patch of bad) {
      expect(
        AddProblemRuleRequestSchema.safeParse({ ...rule, ...patch }).success,
        JSON.stringify(patch),
      ).toBe(false);
    }
  });
});

describe("PSR-25 confirmation", () => {
  it("PSR-25 a rule without confirmedProblemId: true is refused", () => {
    const { confirmedProblemId: _omit, ...without } = rule;
    expect(AddProblemRuleRequestSchema.safeParse(without).success).toBe(false);
    expect(
      AddProblemRuleRequestSchema.safeParse({ ...rule, confirmedProblemId: false }).success,
    ).toBe(false);
  });

  it("PSR-25 the add button needs the box ticked and a label that fits", () => {
    expect(canAddRule(false, "ok")).toBe(false);
    expect(canAddRule(true, "ok")).toBe(true);
    expect(canAddRule(true, "x".repeat(41))).toBe(false);
  });
});

describe("PSR-12 preview", () => {
  const proposal = proposeProblemRule(URL_EXAMPLE, ["hellointerview.com"]);

  it("PSR-12 shows what is kept, what is not and the rule in words", () => {
    if (!proposal.ok) throw new Error("expected a proposal");
    expect(previewLines(proposal)).toEqual({
      keep: "cmlz26cxp08st08adxvy89hr1",
      notKept: "?q=non-functional-requirements",
      rule: "hellointerview.com/learn/system-design/practice/…",
    });
    expect(ruleAddress({ domain: "a.com", prefix: ["x"] })).toBe("a.com/x/…");
  });

  it("PSR-12 failures say why in one sentence", () => {
    expect(proposalFailure("not_http", null)).toContain("http://");
    expect(proposalFailure("no_tracked_domain", "example.com")).toBe(
      "example.com is not one of your tracked sites yet. Add it as a study site first.",
    );
    expect(proposalFailure("built_in", "leetcode.com", "leetcode.com")).toContain(
      "already supported",
    );
    expect(proposalFailure("no_candidate", null)).toContain("up to 64 characters");
  });

  it("PSR-12 an empty label sends the domain (PSR-01)", () => {
    expect(labelToSend("  ", "example.com")).toBe("example.com");
    expect(labelToSend(" My site ", "example.com")).toBe("My site");
  });
});

describe("PSR-13 the list", () => {
  const rows = [
    { id: "00000000-0000-4000-8000-000000000002", domain: "b.com", prefix: ["x"], label: "B" },
    { id: "00000000-0000-4000-8000-000000000001", domain: "a.com", prefix: ["y"], label: null },
    { id: "00000000-0000-4000-8000-000000000003", domain: "b.com", prefix: ["z"], label: "B2" },
  ];
  const rules = problemSiteRules(rows, new Set(["b.com"]));

  it("PSR-13 orders by domain, falls back to the domain as label, flags history and shared domains", () => {
    expect(rules.map((r) => [r.label, r.hasHistory, r.sharesDomain])).toEqual([
      ["a.com", false, false],
      ["B", true, true],
      ["B2", true, true],
    ]);
  });

  it("PSR-13 Remove asks only when the domain has stored ids", () => {
    expect(rules.map(removeNeedsDialog)).toEqual([false, true, true]);
  });

  it("PSR-14 the dashboard label of a domain is the first rule of the list", () => {
    expect(ruleLabels(rules)).toEqual(
      new Map([
        ["a.com", "a.com"],
        ["b.com", "B"],
      ]),
    );
  });

  it("PSR-13 Remove has the three choices", () => {
    expect([SITE_COPY.keepHistory, SITE_COPY.deleteHistory, SITE_COPY.cancel]).toEqual([
      "Remove and keep history",
      "Remove and delete history",
      "Cancel",
    ]);
    expect(RemoveProblemRuleRequestSchema.safeParse({ deleteHistory: true }).success).toBe(true);
    expect(RemoveProblemRuleRequestSchema.safeParse({}).success).toBe(false);
  });
});

describe("PSR-14 shortened ids", () => {
  it("PSR-14 a long id is shortened in the middle, a short one stays whole", () => {
    expect(shortenMiddle("cmlz26cxp08st08adxvy89hr1")).toBe("cmlz26cx…vy89hr1");
    expect(shortenMiddle("short-id")).toBe("short-id");
    expect(shortenMiddle("cmlz26cxp08st08adxvy89hr1")).toHaveLength(16);
  });
});

describe("PSR-15 PSR-12 messages", () => {
  it("PSR-15 the cap message takes the number from the error", () => {
    expect(problemSiteErrorMessage("LIMIT_REACHED", 422, 5)).toBe(
      "You can add up to 5 problem sites. Remove one to add another.",
    );
    expect(problemSiteErrorMessage("LIMIT_REACHED", 422)).toBe(
      "You've reached the limit of problem sites. Remove one to add another.",
    );
    expect(ENTITLEMENTS.PROBLEM_RULES_LIMIT_ERROR_HINT).toBe("PSR-15");
  });

  it("PSR-16 every refusal has its own message, and a lost connection is not a refusal", () => {
    const codes = [
      "DUPLICATE_RULE",
      "DOMAIN_NOT_TRACKED",
      "BUILT_IN_DOMAIN",
      "CONFIRMATION_REQUIRED",
      "INVALID_REQUEST",
      "NOT_AUTHENTICATED",
    ];
    const messages = new Set(codes.map((c) => problemSiteErrorMessage(c, 400)));
    expect(messages.size).toBe(codes.length);
    expect(problemSiteErrorMessage(undefined, null)).toContain("Check your connection");
    expect(problemSiteErrorMessage("INTERNAL", 500, undefined, "remove")).toContain("remove");
  });
});

describe("PSR-12 version note", () => {
  it("PSR-12 PSR-13 the note about extension 0.4.0 is the approved sentence", () => {
    expect(SITE_COPY.versionNote).toBe(
      "Problem sites you add need CareerOS extension 0.4.0 or later. Chrome updates extensions on its own; until then, time on these sites is still tracked, without problem names.",
    );
  });
});
