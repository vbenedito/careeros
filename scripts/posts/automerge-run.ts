/** PST-35: the I/O around `autoMergeDecision`: reads the open record PRs and merges the ready ones. */
import { type PostRecord, PostRecordSchema, slotInstant } from "../../packages/shared/src/posts.ts";
import {
  type AutoMergeInput,
  type AutoMergeReason,
  autoMergeDecision,
  mergeCommitMessage,
} from "./automerge.ts";
import type { GitHubApi, PullInfo } from "./github.ts";
import { checkHold } from "./hold.ts";
import { alertBody, ensureIssue, notMergedTitle } from "./issues.ts";
import { errorInfo, type Out } from "./mask.ts";

const RECORD_PATH = /^posts\/\d{4}\/(\d{4}-\d{2}-\d{2}-[a-z0-9-]+)\.json$/;

export interface AutoMergeRun {
  gh: GitHubApi;
  now: Date;
  postTime: string;
  dryRun: boolean;
  runId: string;
  out: Out;
  /** The daily job (PST-23) only looks for unmerged records: it never merges. */
  alertOnly?: boolean;
}

/** T18: how long before the post time a blocking reason is already an alert. */
const EARLY_ALERT_MIN = 15;
/** Reasons that stop a merge and need a person (`held` is only a notice before the post time). */
const BLOCKING: readonly AutoMergeReason[] = [
  "check-missing",
  "check-not-success",
  "no-approval",
  "opened-too-late",
];
const REASON_TEXT: Record<AutoMergeReason, string> = {
  "check-missing": "the check posts/check has not run (check not green)",
  "check-not-success": "the check posts/check is not green",
  "no-approval": "there is no marketing review approval for the current head commit",
  held: "the PR or an issue has the label hold",
  "opened-too-late": "the PR was opened less than 20 hours before the post",
  "wrong-base": "the PR does not target main",
  "not-only-record": "the PR changes more than one record file",
  "too-early": "it is too early to merge",
  "post-time-passed": "the post time has passed",
};

export async function runAutoMerge(r: AutoMergeRun): Promise<{ failures: number; merged: number }> {
  const result = { failures: 0, merged: 0 };
  for (const pull of await r.gh.listOpenPulls()) {
    try {
      await handlePull(r, pull, result);
    } catch (error) {
      // L6: one failed merge must not stop the other PRs; the exit code is non-zero at the end.
      const info = errorInfo(error);
      result.failures++;
      r.out(
        `PR #${pull.number}: error (http_status=${info.http_status ?? "none"}, code=${info.code ?? "none"})`,
      );
    }
  }
  return result;
}

async function handlePull(
  r: AutoMergeRun,
  pull: PullInfo,
  result: { failures: number; merged: number },
): Promise<void> {
  const ownerLogin = r.gh.repo.split("/")[0] ?? "";
  const files = await r.gh.listPullFiles(pull.number);
  const only = files.length === 1 ? files[0] : undefined;
  const match = only ? RECORD_PATH.exec(only.filename) : null;
  if (!only || !match) return; // not a record PR
  const stem = match[1] as string;
  const text = await r.gh.getFileText(only.filename, pull.head_sha);
  const record = PostRecordSchema.safeParse(text === null ? null : safeJson(text));
  if (!record.success) {
    r.out(`PR #${pull.number}: the record does not parse, not merged`);
    return;
  }
  const held = await checkHold(r.gh, { stem, prNumber: pull.number });
  const input: AutoMergeInput = {
    now: r.now,
    postInstant: slotInstant(record.data.date, record.data.time, record.data.timezone),
    prOpenedAt: new Date(pull.created_at),
    headSha: pull.head_sha,
    statuses: (await r.gh.listStatuses(pull.head_sha)).map((s) => ({
      ...s,
      sha: pull.head_sha,
      createdAt: new Date(s.created_at),
    })),
    baseBranch: pull.base_ref,
    comments: (await r.gh.listComments(pull.number)).map((c) => ({
      ...c,
      createdAt: new Date(c.created_at),
    })),
    ownerLogin,
    held: held.held,
    changedFiles: files,
    recordPath: only.filename,
  };
  const decision = autoMergeDecision(input);
  if (decision.merge) {
    if (r.alertOnly) return;
    r.out(`PR #${pull.number} ${stem}: ${r.dryRun ? "would merge" : "merging"}`);
    if (r.dryRun) return;
    await r.gh.mergePull(pull.number, {
      sha: pull.head_sha,
      title: `feat(posts): ${stem} (#${pull.number})`,
      message: mergeCommitMessage(r.runId),
    });
    result.merged++;
    return;
  }
  const codes = decision.reasons.join(",");
  if (!r.alertOnly) r.out(`PR #${pull.number} ${stem}: not merged (${codes})`);
  await alertUnmerged(r, { pull, stem, record: record.data, reasons: decision.reasons }, result);
  if (r.alertOnly) return;
  // Only inside the merge window a failure counts and gets one comment per reason set.
  const inWindow =
    !decision.reasons.includes("too-early") && !decision.reasons.includes("post-time-passed");
  if (!inWindow) return;
  result.failures++;
  if (r.dryRun) return;
  const marker = `<!-- posts-auto-merge-reason:${codes}:${pull.head_sha} -->`;
  const seen = (await r.gh.listComments(pull.number)).some((c) => c.body.includes(marker));
  if (!seen) {
    await r.gh.createComment(
      pull.number,
      `${marker}\nNot merged yet: ${codes}.\nAdd the label \`hold\` to stop this post.`,
    );
  }
}

/**
 * T18: an open record PR for main whose post time passed (or is 15 minutes away with a blocker
 * left) gets one `post-alert`. A hold alone, before the post time, is only a notice.
 */
async function alertUnmerged(
  r: AutoMergeRun,
  input: {
    pull: PullInfo;
    stem: string;
    record: Pick<PostRecord, "date" | "time" | "timezone" | "slug">;
    reasons: readonly AutoMergeReason[];
  },
  result: { failures: number },
): Promise<void> {
  const { pull, stem, record, reasons } = input;
  if (reasons.includes("wrong-base") || reasons.includes("not-only-record")) return;
  const post = slotInstant(record.date, record.time, record.timezone).getTime();
  const passed = reasons.includes("post-time-passed");
  const early = !passed && r.now.getTime() >= post - EARLY_ALERT_MIN * 60_000;
  if (!passed && !early) return;
  const blockers = reasons.filter((c) => BLOCKING.includes(c));
  const held = reasons.includes("held");
  if (early && blockers.length === 0 && !held) return;
  const text = reasons
    .filter((c) => c !== "post-time-passed" && c !== "too-early")
    .map((c) => `- ${REASON_TEXT[c]}`)
    .join("\n");
  if (passed) result.failures++;
  r.out(
    `PR #${pull.number} ${stem}: ${passed ? "record not merged at post time" : "may not be merged in time"}`,
  );
  if (r.dryRun) return;
  const notice = early && blockers.length === 0; // only `held`
  const what = passed
    ? `The record PR #${pull.number} is still open at post time, so nothing is published.`
    : notice
      ? `The record PR #${pull.number} is on hold and will not be merged for this post.`
      : `The record PR #${pull.number} cannot be merged yet and the post time is close.`;
  await ensureIssue(r.gh, {
    title: notMergedTitle(stem),
    labels: [notice ? "post-reminder" : "post-alert"],
    body: alertBody({
      record,
      platform: "all",
      what: `${what}${text ? `\nReasons:\n${text}` : ""}`,
      next: passed
        ? "Move the record to a new date in the PR (P11); it is merged for that slot. A merge after the post time never publishes this slot."
        : notice
          ? "Remove the label hold before the post time to let the post go out, or move the record to a new date in the PR (P11)."
          : "Fix the reasons before the post time, or move the record to a new date in the PR (P11).",
    }),
  });
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
