import { describe, expect, it } from "vitest";
import { REVIEW_MARKER } from "./automerge.ts";
import { runAutoMerge } from "./automerge-run.ts";
import type { CommentInfo, StatusInfo } from "./github.ts";
import { FakeGitHub, makeRecord, must, RECORD_PATH } from "./testkit.ts";

const HEAD = "h".repeat(40);

class MergeGitHub extends FakeGitHub {
  override async getFileText(): Promise<string | null> {
    return JSON.stringify(makeRecord());
  }
  override async listStatuses(): Promise<StatusInfo[]> {
    return [{ context: "posts/check", state: "success", created_at: "2026-11-25T18:05:00Z" }];
  }
  override async listComments(): Promise<CommentInfo[]> {
    return [
      {
        id: 1,
        body: `${REVIEW_MARKER}\n${HEAD}`,
        login: "vbenedito",
        created_at: "2026-11-25T18:30:00Z",
      },
      ...this.comments.map((body, i) => ({
        id: 10 + i,
        body,
        login: "bot",
        created_at: "2026-11-26T20:00:00Z",
      })),
    ];
  }
}

const setup = () => {
  const gh = new MergeGitHub();
  const open = {
    ...must(gh.pulls[0]),
    number: 30,
    state: "open",
    merged_at: null,
    merge_commit_sha: null,
  };
  gh.openPulls = [open];
  gh.pulls = [open];
  gh.pullFiles.set(30, [{ filename: RECORD_PATH, status: "added" }]);
  return gh;
};
const run = (gh: MergeGitHub, now: string, dryRun = false) =>
  runAutoMerge({
    gh,
    now: new Date(now),
    postTime: "19:00",
    dryRun,
    runId: "777",
    out: () => undefined,
  });

describe("PST-35 auto-merge run", () => {
  it("PST-35 merges a ready record PR inside the window", async () => {
    const gh = setup();
    expect(await run(gh, "2026-11-26T20:15:00Z")).toEqual({ failures: 0, merged: 1 });
    expect(gh.writes).toEqual(["merge #30"]);
  });
  it("PST-35 a dry run merges nothing", async () => {
    const gh = setup();
    await run(gh, "2026-11-26T20:15:00Z", true);
    expect(gh.writes).toEqual([]);
  });
  it("PST-36 a held PR is not merged and gets one comment, not one per run", async () => {
    const gh = setup();
    gh.pulls = [{ ...must(gh.pulls[0]), labels: ["hold"] }];
    gh.openPulls = gh.pulls;
    expect((await run(gh, "2026-11-26T20:15:00Z")).failures).toBe(1);
    await run(gh, "2026-11-26T20:30:00Z");
    expect(gh.comments).toHaveLength(1);
    expect(gh.comments[0]).toContain("held");
    expect(gh.writes).not.toContain("merge #30");
  });
  it("PST-35 before post time minus the lead nothing happens and nothing is counted", async () => {
    const gh = setup();
    expect(await run(gh, "2026-11-26T12:00:00Z")).toEqual({ failures: 0, merged: 0 });
    expect(gh.writes).toEqual([]);
  });
  it("PST-35 a PR that is not a single record file is ignored", async () => {
    const gh = setup();
    gh.pullFiles.set(30, [{ filename: "README.md", status: "modified" }]);
    expect(await run(gh, "2026-11-26T20:15:00Z")).toEqual({ failures: 0, merged: 0 });
  });
});

describe("PST-35 auto-merge run keeps going", () => {
  it("PST-35 one failed merge does not stop the other PRs and counts as a failure", async () => {
    const gh = setup();
    const second = { ...must(gh.openPulls[0]), number: 31, head_sha: HEAD };
    gh.openPulls = [must(gh.openPulls[0]), second];
    gh.pulls = gh.openPulls;
    gh.pullFiles.set(31, [{ filename: RECORD_PATH, status: "added" }]);
    const attempted: number[] = [];
    gh.mergePull = async (n) => {
      attempted.push(n);
      if (n === 30) throw new Error("conflict");
    };
    const result = await run(gh, "2026-11-26T20:15:00Z");
    expect(attempted).toEqual([30, 31]);
    expect(result).toEqual({ failures: 1, merged: 1 });
  });
});

class UnapprovedGitHub extends MergeGitHub {
  override async listComments(): Promise<CommentInfo[]> {
    return [];
  }
}

describe("PST-35 T18 record not merged at post time", () => {
  const alertTitle = "2026-11-26-restart-after-gap: record not merged at post time";
  it("PST-35 an open record PR at post time opens one post-alert, updated by later runs", async () => {
    const gh = setup();
    const first = await run(gh, "2026-11-26T22:05:00Z");
    expect(first.failures).toBe(1);
    await run(gh, "2026-11-26T22:20:00Z");
    expect(gh.issues).toHaveLength(1);
    const issue = must(gh.issues[0]);
    expect(issue.title).toBe(alertTitle);
    expect(issue.labels).toEqual(["post-alert"]);
    expect(issue.body).toContain("Move the record to a new date in the PR (P11)");
    expect(gh.writes.filter((w) => w.startsWith("merge"))).toEqual([]);
  });
  it("PST-35 the alert names the reasons that blocked the merge", async () => {
    const gh = new UnapprovedGitHub();
    const pull = {
      ...must(gh.pulls[0]),
      number: 30,
      state: "open",
      merged_at: null,
      labels: ["hold"],
    };
    gh.openPulls = [pull];
    gh.pulls = [pull];
    gh.pullFiles.set(30, [{ filename: RECORD_PATH, status: "added" }]);
    gh.getFileText = async () => JSON.stringify(makeRecord());
    gh.listStatuses = async () => [];
    await run(gh, "2026-11-26T22:05:00Z");
    const body = must(gh.issues[0]).body;
    expect(body).toContain("no marketing review approval");
    expect(body).toContain("not green");
    expect(body).toContain("label hold");
  });
  it("PST-35 15 minutes before the post, a missing approval already opens the alert", async () => {
    const gh = new UnapprovedGitHub();
    const pull = { ...must(gh.pulls[0]), number: 30, state: "open", merged_at: null };
    gh.openPulls = [pull];
    gh.pulls = [pull];
    gh.pullFiles.set(30, [{ filename: RECORD_PATH, status: "added" }]);
    gh.getFileText = async () => JSON.stringify(makeRecord());
    gh.listStatuses = async () => [
      { context: "posts/check", state: "success", created_at: "2026-11-25T18:05:00Z" },
    ];
    await run(gh, "2026-11-26T21:30:00Z"); // 30 min before: only the comment
    expect(gh.issues).toEqual([]);
    await run(gh, "2026-11-26T21:45:00Z");
    expect(must(gh.issues[0]).labels).toEqual(["post-alert"]);
    expect(must(gh.issues[0]).body).toContain("no marketing review approval");
  });
  it("PST-36 15 minutes before the post, a hold alone is a notice, not an alert", async () => {
    const gh = setup();
    const held = { ...must(gh.pulls[0]), labels: ["hold"] };
    gh.pulls = [held];
    gh.openPulls = [held];
    await run(gh, "2026-11-26T21:50:00Z");
    expect(gh.issues).toHaveLength(1);
    expect(must(gh.issues[0]).labels).toEqual(["post-reminder"]);
    expect(must(gh.issues[0]).body).toContain("on hold");
  });
  it("PST-35 a PR that is not for main, or a dry run, opens nothing", async () => {
    const gh = setup();
    const other = { ...must(gh.pulls[0]), base_ref: "feature" };
    gh.pulls = [other];
    gh.openPulls = [other];
    await run(gh, "2026-11-26T22:05:00Z");
    expect(gh.issues).toEqual([]);
    const dry = setup();
    await run(dry, "2026-11-26T22:05:00Z", true);
    expect(dry.issues).toEqual([]);
    expect(dry.writes).toEqual([]);
  });
  it("PST-35 the daily mode only alerts: it never merges a ready PR", async () => {
    const gh = setup();
    await runAutoMerge({
      gh,
      now: new Date("2026-11-26T20:15:00Z"),
      postTime: "19:00",
      dryRun: false,
      runId: "0",
      out: () => undefined,
      alertOnly: true,
    });
    expect(gh.writes).toEqual([]);
  });
});
