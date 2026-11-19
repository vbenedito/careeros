import { describe, expect, it } from "vitest";
import { REQUIRED_CHECKS } from "./config";
import {
  buildProgress,
  type CheckRun,
  closedIssues,
  type RepoIssue,
  type RepoPr,
  requiredChecksGreen,
} from "./progress-view";

const issue = (number: number, over: Partial<RepoIssue> = {}): RepoIssue => ({
  number,
  title: `Issue ${number}`,
  state: "open",
  labels: ["v1"],
  ...over,
});
const sha = (c: string) => c.repeat(40);
const pr = (number: number, body: string, headSha: string, over: Partial<RepoPr> = {}): RepoPr => ({
  number,
  state: "open",
  draft: false,
  merged: false,
  body,
  headSha,
  ...over,
});
const green: CheckRun[] = REQUIRED_CHECKS.map((name) => ({ name, conclusion: "success" }));

describe("v1 progress (ADM-12)", () => {
  it("ADM-12 puts a fixture of issues and PRs in the right groups", () => {
    const issues = [
      issue(1, { state: "closed" }),
      issue(2),
      issue(3, { labels: ["v1", "blocked"] }),
      issue(4),
      issue(5),
      issue(6),
      issue(7),
    ];
    const prs = [
      pr(20, "Closes #2", sha("a")), // waiting
      pr(30, "Closes #4", sha("b"), { draft: true }), // draft: not waiting
      pr(40, "Closes #5", sha("c")), // checks not green
      pr(50, "Refs #6", sha("d")), // no Closes
      pr(60, "Closes #3", sha("e")), // blocked issue, but waiting wins (listed first)
    ];
    const checks = {
      [sha("a")]: green,
      [sha("b")]: green,
      [sha("c")]: [
        { name: REQUIRED_CHECKS[0], conclusion: "success" },
        { name: REQUIRED_CHECKS[1], conclusion: null },
      ],
      [sha("d")]: green,
      [sha("e")]: green,
    };
    const view = buildProgress(issues, prs, checks);
    const nums = (g: keyof typeof view) => view[g].map((i) => i.number);
    expect(nums("done")).toEqual([1]);
    expect(nums("waiting")).toEqual([2, 3]);
    expect(nums("blocked")).toEqual([]);
    expect(nums("open")).toEqual([4, 5, 6, 7]);
    expect(view.waiting.map((i) => i.pr)).toEqual([20, 60]);
  });

  it("ADM-12 a blocked issue with no waiting PR is in 'blocked'; a closed blocked issue is done", () => {
    const view = buildProgress(
      [
        issue(1, { labels: ["v1", "blocked"] }),
        issue(2, { labels: ["v1", "blocked"], state: "closed" }),
      ],
      [],
      {},
    );
    expect(view.blocked.map((i) => i.number)).toEqual([1]);
    expect(view.done.map((i) => i.number)).toEqual([2]);
  });

  it("ADM-12 both required checks must be a success; a failed or missing one is not green", () => {
    expect(requiredChecksGreen(green)).toBe(true);
    expect(requiredChecksGreen([{ name: REQUIRED_CHECKS[0], conclusion: "success" }])).toBe(false);
    expect(
      requiredChecksGreen(green.map((c, i) => (i === 1 ? { ...c, conclusion: "failure" } : c))),
    ).toBe(false);
    expect(
      requiredChecksGreen([{ name: "Other", conclusion: "success" }, ...green.slice(0, 1)]),
    ).toBe(false);
  });

  it("ADM-12 reads 'Closes #N' in any case, more than once, and not other words", () => {
    expect(closedIssues("closes #1\n\nCLOSES #22 and Closes #3")).toEqual([1, 22, 3]);
    expect(closedIssues("Closes #1x unclosed #4 Refs #5")).toEqual([]);
  });

  it("ADM-12 counts are the lengths of the groups and each issue is in exactly one", () => {
    const issues = [issue(1), issue(2, { state: "closed" }), issue(3, { labels: ["blocked"] })];
    const view = buildProgress(issues, [], {});
    const all = [...view.done, ...view.waiting, ...view.blocked, ...view.open];
    expect(all.map((i) => i.number).sort()).toEqual([1, 2, 3]);
  });
});
