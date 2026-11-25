/**
 * PST-10 (+ P6, T12): the approval check at publish time. The record's last commit on `main` must
 * be the `merge_commit_sha` of a merged PR; when `POSTS_APPROVER_LOGIN` is set that PR must be
 * merged by that login (the real control). For `github-actions[bot]` the squash message must also
 * name a run of the auto-merge workflow (extra check). Then the full PST-09 validation runs again
 * (no "past" check), with the asset hash recomputed from the asset bytes.
 */
import { createHash } from "node:crypto";
import {
  type MeasuredAsset,
  type PostFailure,
  type PostRecord,
  PostRecordSchema,
  validateRecord,
} from "../../packages/shared/src/posts.ts";
import type { GitHubApi } from "./github.ts";
import type { Out } from "./mask.ts";

export const BOT_LOGIN = "github-actions[bot]";
export const AUTO_MERGE_WORKFLOW = ".github/workflows/posts-auto-merge.yml";
const TRAILER = /^Posts-Auto-Merge-Run:[ \t]*(\d+)[ \t]*$/m;

export type ApprovalResult =
  | { ok: true; mergeCommitSha: string; prNumber: number }
  | { ok: false; reason: string };

export interface ApprovalInput {
  /** Repo-relative path of the record, e.g. `posts/2026/2026-11-26-restart-after-gap.json`. */
  recordPath: string;
  /** `POSTS_APPROVER_LOGIN`; null when not set. */
  approverLogin: string | null;
  branch?: string;
}

/**
 * The auto-merge run named by the commit trailer. The run object has no `inputs`, so a manual
 * dry run is told apart by its title: the workflow must set
 * `run-name: posts-auto-merge dry_run=${{ inputs.dry_run }}` (documented in the PR). Without it
 * only the event `schedule` or `workflow_dispatch` is checked.
 */
async function checkAutoMergeRun(gh: GitHubApi, message: string): Promise<string | null> {
  const match = TRAILER.exec(message);
  if (!match) return "squash commit has no Posts-Auto-Merge-Run trailer";
  const run = await gh.getRun(Number(match[1]));
  const path = run.path.split("@")[0];
  if (path !== AUTO_MERGE_WORKFLOW) return "the run is not the auto-merge workflow";
  if (run.head_branch !== "main") return "the auto-merge run did not run on main";
  if (run.event !== "schedule" && run.event !== "workflow_dispatch") {
    return "the auto-merge run has an unexpected event";
  }
  if (run.event === "workflow_dispatch" && /dry_run=true/i.test(run.display_title)) {
    return "the auto-merge run was a dry run";
  }
  return null;
}

export async function checkApproval(gh: GitHubApi, input: ApprovalInput): Promise<ApprovalResult> {
  const commit = await gh.lastCommitOfFile(input.recordPath, input.branch ?? "main");
  if (!commit) return { ok: false, reason: "the record has no commit on main" };
  const pulls = await gh.pullsOfCommit(commit.sha);
  // The endpoint also returns open PRs: both fields are checked.
  const merged = pulls.find((p) => p.merge_commit_sha === commit.sha && p.merged_at !== null);
  if (!merged) return { ok: false, reason: "the last commit of the record is not a merged PR" };
  if (input.approverLogin !== null) {
    const pull = await gh.getPull(merged.number);
    if (pull.merged_by?.login !== input.approverLogin) {
      return { ok: false, reason: "the PR was not merged by the approved login" };
    }
    if (input.approverLogin === BOT_LOGIN) {
      const problem = await checkAutoMergeRun(gh, commit.message);
      if (problem) return { ok: false, reason: problem };
    }
  }
  return { ok: true, mergeCommitSha: commit.sha, prNumber: merged.number };
}

/** What `ffprobe` told about the video (a stub in tests). */
export type VideoProbe = (
  bytes: Uint8Array,
) => Promise<{ width: number; height: number; durationS: number }>;

export type VerifyResult =
  | { ok: true; record: PostRecord; prNumber: number; assetId: number; asset: Uint8Array }
  | { ok: false; reason: string; failures: PostFailure[] };

export interface VerifyInput extends ApprovalInput {
  recordText: string;
  existingSlugs: readonly string[];
  now: Date;
  postTime: string;
  probe: VideoProbe;
  out: Out;
  mask: (value: string) => string;
}

/** Approval, then the full PST-09 validation again with the asset hash recomputed. */
export async function verifyRecordForPublish(
  gh: GitHubApi,
  input: VerifyInput,
): Promise<VerifyResult> {
  const approval = await checkApproval(gh, input);
  if (!approval.ok) return { ok: false, reason: approval.reason, failures: [] };
  let data: unknown;
  try {
    data = JSON.parse(input.recordText);
  } catch {
    return { ok: false, reason: "the record is not valid JSON", failures: [] };
  }
  const parsed = PostRecordSchema.safeParse(data);
  let measured: MeasuredAsset | undefined;
  if (parsed.success) {
    const { release, asset } = parsed.data.video;
    const found = await gh.findReleaseAsset(release, asset);
    if (!found) {
      measured = { found: false, sha256: "", width: 0, height: 0, durationS: 0 };
    } else {
      const bytes = await gh.assetBytes(found.id, input.mask);
      const probe = await input.probe(bytes);
      measured = {
        found: true,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        ...probe,
      };
      const failures = validateRecord(data, {
        path: input.recordPath,
        existingSlugs: input.existingSlugs,
        now: input.now,
        postTime: input.postTime,
        checkPast: false,
        asset: measured,
      });
      return failures.length === 0
        ? {
            ok: true,
            record: parsed.data,
            prNumber: approval.prNumber,
            assetId: found.id,
            asset: bytes,
          }
        : { ok: false, reason: "the record failed validation", failures };
    }
  }
  const failures = validateRecord(data, {
    path: input.recordPath,
    existingSlugs: input.existingSlugs,
    now: input.now,
    postTime: input.postTime,
    checkPast: false,
    ...(measured ? { asset: measured } : {}),
  });
  return { ok: false, reason: "the record failed validation", failures };
}
