import { describe, expect, it } from "vitest";
import { agent, session, TWO_SESSIONS } from "./fixtures";
import { mergeStates, type RepoPr } from "./progress-view";
import { buildReviewRows } from "./reviews-view";

const pr = (over: Partial<RepoPr>): RepoPr => ({
  number: 1,
  state: "open",
  draft: false,
  merged: false,
  body: "",
  headSha: "a".repeat(40),
  ...over,
});

describe("reviews per PR (ADM-11)", () => {
  it("ADM-11 one row per PR with review records: largest rounds, summed findings, reviewer models", () => {
    const rows = buildReviewRows(TWO_SESSIONS, null);
    expect(rows.map((r) => r.pr)).toEqual([90, 70]);
    expect(rows[0]).toMatchObject({ rounds: 3, high: 2, medium: 1, reviewers: ["sonnet", "opus"] });
    expect(rows[1]).toMatchObject({ rounds: 2, high: 1, medium: 2, reviewers: ["sonnet"] });
  });

  it("ADM-11 author and fix records and records without a PR make no row", () => {
    const rows = buildReviewRows(
      [
        session({
          agents: [
            agent({ work: "author", pr: 5, rounds: 4 }),
            agent({ work: "fix", pr: 5 }),
            agent({ work: "review", pr: null, rounds: 2 }),
          ],
        }),
      ],
      null,
    );
    expect(rows).toEqual([]);
  });

  it("ADM-11 a review without findings counts zero", () => {
    const [row] = buildReviewRows([session({ agents: [agent({ work: "review", pr: 4 })] })], null);
    expect(row).toMatchObject({ pr: 4, high: 0, medium: 0, rounds: 1 });
  });

  it("ADM-11 merge state comes from GitHub; a PR GitHub does not list, or no GitHub data, is unknown", () => {
    const states = mergeStates([
      pr({ number: 90, state: "closed", merged: true }),
      pr({ number: 71, draft: true }),
    ]);
    const rows = buildReviewRows(TWO_SESSIONS, states);
    expect(rows.map((r) => r.state)).toEqual(["merged", "unknown"]);
    expect(buildReviewRows(TWO_SESSIONS, null).map((r) => r.state)).toEqual(["unknown", "unknown"]);
  });

  it("ADM-11 merge states: merged, closed without merge, draft, open", () => {
    const m = mergeStates([
      pr({ number: 1, state: "closed", merged: true }),
      pr({ number: 2, state: "closed" }),
      pr({ number: 3, draft: true }),
      pr({ number: 4 }),
    ]);
    expect([1, 2, 3, 4].map((n) => m.get(n))).toEqual(["merged", "closed", "draft", "open"]);
  });
});
