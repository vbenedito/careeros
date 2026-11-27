import { describe, expect, it } from "vitest";
import {
  type AutoMergeInput,
  autoMergeDecision,
  mergeCommitMessage,
  REVIEW_MARKER,
} from "./automerge.ts";

const HEAD = "a".repeat(40);
const POST = new Date("2026-11-26T22:00:00Z");
const PATH = "posts/2026/2026-11-26-restart-after-gap.json";

const base = (over: Partial<AutoMergeInput> = {}): AutoMergeInput => ({
  now: new Date("2026-11-26T20:15:00Z"),
  postInstant: POST,
  prOpenedAt: new Date("2026-11-25T18:00:00Z"),
  headSha: HEAD,
  statuses: [
    {
      context: "posts/check",
      state: "success",
      createdAt: new Date("2026-11-25T18:05:00Z"),
      sha: HEAD,
    },
  ],
  baseBranch: "main",
  comments: [
    {
      body: `${REVIEW_MARKER}\nReviewed ${HEAD}\nSkills used: voice`,
      login: "vbenedito",
      createdAt: new Date("2026-11-25T18:30:00Z"),
    },
  ],
  ownerLogin: "vbenedito",
  held: false,
  changedFiles: [{ filename: PATH, status: "added" }],
  recordPath: PATH,
  ...over,
});

const reasons = (over: Partial<AutoMergeInput>) => {
  const d = autoMergeDecision(base(over));
  return d.merge ? [] : d.reasons;
};

describe("PST-35 auto-merge decision", () => {
  it("PST-36 merges when every rule holds", () => {
    expect(autoMergeDecision(base())).toEqual({ merge: true });
  });
  it("PST-37 needs a posts/check status that is success on the head SHA", () => {
    expect(reasons({ statuses: [] })).toContain("check-missing");
    expect(
      reasons({
        statuses: [
          {
            context: "posts/check",
            state: "failure",
            createdAt: new Date("2026-11-25T18:05:00Z"),
            sha: HEAD,
          },
        ],
      }),
    ).toContain("check-not-success");
    expect(
      reasons({
        statuses: [
          {
            context: "posts/check",
            state: "success",
            createdAt: new Date("2026-11-25T18:05:00Z"),
            sha: "b".repeat(40),
          },
        ],
      }),
    ).toContain("check-missing");
  });
  it("PST-35 uses the newest check status: a later failure blocks", () => {
    const statuses = [
      {
        context: "posts/check",
        state: "success",
        createdAt: new Date("2026-11-25T18:05:00Z"),
        sha: HEAD,
      },
      {
        context: "posts/check",
        state: "failure",
        createdAt: new Date("2026-11-25T19:00:00Z"),
        sha: HEAD,
      },
    ];
    expect(reasons({ statuses })).toContain("check-not-success");
  });
  it("PST-37 the approval must come from the owner login", () => {
    const comments = [
      {
        body: `${REVIEW_MARKER}\n${HEAD}`,
        login: "someone-else",
        createdAt: new Date("2026-11-25T18:30:00Z"),
      },
    ];
    expect(reasons({ comments })).toContain("no-approval");
  });
  it("PST-37 the approval must name the current head SHA", () => {
    const comments = [
      {
        body: `${REVIEW_MARKER}\n${"b".repeat(40)}`,
        login: "vbenedito",
        createdAt: new Date("2026-11-25T18:30:00Z"),
      },
    ];
    expect(reasons({ comments })).toContain("no-approval");
  });
  it("PST-37 the marker must be the first line", () => {
    const comments = [
      {
        body: `Looks good\n${REVIEW_MARKER}\n${HEAD}`,
        login: "vbenedito",
        createdAt: new Date("2026-11-25T18:30:00Z"),
      },
    ];
    expect(reasons({ comments })).toContain("no-approval");
  });
  it("PST-37 an approval older than the check success does not count", () => {
    const comments = [
      {
        body: `${REVIEW_MARKER}\n${HEAD}`,
        login: "vbenedito",
        createdAt: new Date("2026-11-25T18:01:00Z"),
      },
    ];
    expect(reasons({ comments })).toContain("no-approval");
  });
  it("PST-36 a hold stops the merge", () => {
    expect(reasons({ held: true })).toContain("held");
  });
  it("PST-35 the PR must be open at least VETO_WINDOW_H before the post", () => {
    expect(reasons({ prOpenedAt: new Date("2026-11-26T02:00:01Z") })).toContain("opened-too-late");
    expect(reasons({ prOpenedAt: new Date("2026-11-26T02:00:00Z") })).not.toContain(
      "opened-too-late",
    );
  });
  it("PST-35 only one record file under posts/YYYY may change, added or modified", () => {
    expect(reasons({ changedFiles: [] })).toContain("not-only-record");
    expect(
      reasons({
        changedFiles: [
          { filename: PATH, status: "added" },
          { filename: "README.md", status: "modified" },
        ],
      }),
    ).toContain("not-only-record");
    expect(reasons({ changedFiles: [{ filename: PATH, status: "renamed" }] })).toContain(
      "not-only-record",
    );
    expect(reasons({ changedFiles: [{ filename: PATH, status: "removed" }] })).toContain(
      "not-only-record",
    );
    expect(
      reasons({
        changedFiles: [{ filename: "posts-state/2026/x.json", status: "added" }],
        recordPath: "posts-state/2026/x.json",
      }),
    ).toContain("not-only-record");
    expect(reasons({ changedFiles: [{ filename: PATH, status: "modified" }] })).toEqual([]);
  });
  it("PST-35 only a PR into main merges", () => {
    expect(reasons({ baseBranch: "other" })).toContain("wrong-base");
  });
  it("PST-35 merges only from post time minus AUTO_MERGE_LEAD_H up to the post time", () => {
    expect(reasons({ now: new Date("2026-11-26T19:59:59Z") })).toContain("too-early");
    expect(reasons({ now: new Date("2026-11-26T20:00:00Z") })).toEqual([]);
    expect(reasons({ now: new Date("2026-11-26T21:59:59Z") })).toEqual([]);
    expect(reasons({ now: new Date("2026-11-26T22:00:00Z") })).toContain("post-time-passed");
  });
  it("PST-35 the merge commit message ends with the run trailer", () => {
    expect(mergeCommitMessage("123").endsWith("Posts-Auto-Merge-Run: 123")).toBe(true);
    expect(() => mergeCommitMessage("12x")).toThrow();
  });
});
