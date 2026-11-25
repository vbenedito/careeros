import { beforeEach, describe, expect, it } from "vitest";
import { checkApproval, verifyRecordForPublish } from "./approval.ts";
import {
  FakeGitHub,
  goodProbe,
  makeRecord,
  must,
  RECORD_PATH,
  recordFile,
  VIDEO,
} from "./testkit.ts";

const input = { recordPath: RECORD_PATH, approverLogin: "github-actions[bot]" };
let gh: FakeGitHub;
beforeEach(() => {
  gh = new FakeGitHub();
});

describe("PST-10 approval check", () => {
  it("PST-10 accepts a squash commit of a PR merged by the approver with a valid auto-merge run", async () => {
    expect(await checkApproval(gh, input)).toMatchObject({ ok: true, prNumber: 12 });
  });
  it("PST-10 rejects a record whose last commit is not a merged PR (pushed to main)", async () => {
    gh.pulls = [];
    expect(await checkApproval(gh, input)).toMatchObject({ ok: false });
  });
  it("PST-10 rejects the PR of an open (unmerged) pull request", async () => {
    gh.pulls = [{ ...must(gh.pulls[0]), merged_at: null, state: "open" }];
    expect(await checkApproval(gh, input)).toMatchObject({ ok: false });
  });
  it("PST-10 rejects a PR whose merge commit is another commit", async () => {
    gh.pulls = [{ ...must(gh.pulls[0]), merge_commit_sha: "d".repeat(40) }];
    expect(await checkApproval(gh, input)).toMatchObject({ ok: false });
  });
  it("PST-10 rejects a PR merged by another login", async () => {
    gh.pulls = [{ ...must(gh.pulls[0]), merged_by: { login: "vbenedito" } }];
    expect(await checkApproval(gh, input)).toMatchObject({ ok: false });
  });
  it("P6 a bot merge without the Posts-Auto-Merge-Run trailer is rejected", async () => {
    gh.commit = { sha: "c".repeat(40), message: "feat(posts): x (#12)" };
    expect(await checkApproval(gh, input)).toMatchObject({ ok: false });
  });
  it("P6 a bot merge from another workflow is rejected", async () => {
    gh.runs.set(555, { ...must(gh.runs.get(555)), path: ".github/workflows/other.yml" });
    expect(await checkApproval(gh, input)).toMatchObject({ ok: false });
  });
  it("P6 a run on another branch or event is rejected", async () => {
    gh.runs.set(555, { ...must(gh.runs.get(555)), head_branch: "feature" });
    expect(await checkApproval(gh, input)).toMatchObject({ ok: false });
    gh.runs.set(555, { ...must(gh.runs.get(555)), head_branch: "main", event: "push" });
    expect(await checkApproval(gh, input)).toMatchObject({ ok: false });
  });
  it("P6 a dispatched dry run is rejected, a normal dispatch is accepted", async () => {
    gh.runs.set(555, {
      ...must(gh.runs.get(555)),
      event: "workflow_dispatch",
      display_title: "posts-auto-merge dry_run=true",
    });
    expect(await checkApproval(gh, input)).toMatchObject({ ok: false });
    gh.runs.set(555, {
      ...must(gh.runs.get(555)),
      display_title: "posts-auto-merge dry_run=false",
    });
    expect(await checkApproval(gh, input)).toMatchObject({ ok: true });
  });
  it("PST-10 without POSTS_APPROVER_LOGIN only the merged PR is required", async () => {
    gh.pulls = [{ ...must(gh.pulls[0]), merged_by: { login: "anyone" } }];
    expect(await checkApproval(gh, { ...input, approverLogin: null })).toMatchObject({ ok: true });
  });
});

describe("PST-10 full validation again", () => {
  const verify = (over: Partial<Parameters<typeof verifyRecordForPublish>[1]> = {}) =>
    verifyRecordForPublish(gh, {
      ...input,
      recordText: recordFile().text,
      existingSlugs: [],
      now: new Date("2026-11-26T22:10:00Z"),
      postTime: "19:00",
      probe: goodProbe,
      out: () => undefined,
      mask: (v) => v,
      ...over,
    });

  it("PST-10 passes a valid record even though its time is in the past", async () => {
    expect(await verify()).toMatchObject({ ok: true, assetId: 9 });
  });
  it("PST-10 recomputes the SHA-256 from the asset bytes", async () => {
    gh.assetBytesValue = new Uint8Array([...VIDEO, 9]);
    const result = await verify();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failures.map((f) => f.code)).toContain("asset-sha256");
  });
  it("PST-10 fails when the asset is missing or the video has the wrong size", async () => {
    gh.asset = null;
    expect((await verify()).ok).toBe(false);
    gh.asset = { id: 9, name: "x" };
    const small = await verify({
      probe: async () => ({ width: 720, height: 1280, durationS: 30 }),
    });
    expect(small.ok).toBe(false);
  });
  it("PST-10 fails an invalid record that was merged", async () => {
    const bad = JSON.stringify({ ...makeRecord(), render: "NOT VALID" });
    const result = await verify({ recordText: bad });
    expect(result.ok).toBe(false);
  });
  it("PST-10 fails when approval fails, without reading the asset", async () => {
    gh.pulls = [];
    expect((await verify()).ok).toBe(false);
  });
});
