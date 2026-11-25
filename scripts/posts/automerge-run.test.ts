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

describe("P6 auto-merge run", () => {
  it("P6 merges a ready record PR inside the window", async () => {
    const gh = setup();
    expect(await run(gh, "2026-11-26T20:15:00Z")).toEqual({ failures: 0, merged: 1 });
    expect(gh.writes).toEqual(["merge #30"]);
  });
  it("P6 a dry run merges nothing", async () => {
    const gh = setup();
    await run(gh, "2026-11-26T20:15:00Z", true);
    expect(gh.writes).toEqual([]);
  });
  it("P6 a held PR is not merged and gets one comment, not one per run", async () => {
    const gh = setup();
    gh.pulls = [{ ...must(gh.pulls[0]), labels: ["hold"] }];
    gh.openPulls = gh.pulls;
    expect((await run(gh, "2026-11-26T20:15:00Z")).failures).toBe(1);
    await run(gh, "2026-11-26T20:30:00Z");
    expect(gh.comments).toHaveLength(1);
    expect(gh.comments[0]).toContain("held");
    expect(gh.writes).not.toContain("merge #30");
  });
  it("P6 before post time minus the lead nothing happens and nothing is counted", async () => {
    const gh = setup();
    expect(await run(gh, "2026-11-26T12:00:00Z")).toEqual({ failures: 0, merged: 0 });
    expect(gh.writes).toEqual([]);
  });
  it("P6 a PR that is not a single record file is ignored", async () => {
    const gh = setup();
    gh.pullFiles.set(30, [{ filename: "README.md", status: "modified" }]);
    expect(await run(gh, "2026-11-26T20:15:00Z")).toEqual({ failures: 0, merged: 0 });
  });
});
