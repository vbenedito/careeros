/**
 * PST-35 (P6, T13): the pure decision of the auto-merge workflow. It merges a record PR only when
 * every rule holds; otherwise it returns the reasons. No network, no clock: all inputs are given.
 */
import { AUTO_MERGE_LEAD_H, VETO_WINDOW_H } from "../../packages/shared/src/posts.ts";

export const REVIEW_MARKER = "<!-- posts-marketing-review: approved -->";
export const CHECK_CONTEXT = "posts/check";

export type AutoMergeReason =
  | "check-missing"
  | "check-not-success"
  | "no-approval"
  | "held"
  | "opened-too-late"
  | "wrong-base"
  | "not-only-record"
  | "too-early"
  | "post-time-passed";

export interface AutoMergeInput {
  now: Date;
  /** Post time of the record (the instant of its date, time and timezone). */
  postInstant: Date;
  prOpenedAt: Date;
  headSha: string;
  /** Statuses of the head commit; the newest `posts/check` one decides. */
  /** Each status names the commit it was set on; only the head SHA counts. */
  statuses: readonly { context: string; state: string; createdAt: Date; sha: string }[];
  /** Base branch of the PR; only `main` is merged. */
  baseBranch: string;
  comments: readonly { body: string; login: string; createdAt: Date }[];
  /** Login of the repository owner (not hardcoded: the caller passes it). */
  ownerLogin: string;
  /** `hold` found on the PR or on an open issue with the stem (PST-36). */
  held: boolean;
  changedFiles: readonly { filename: string; status: string }[];
  recordPath: string;
}

export type AutoMergeDecision = { merge: true } | { merge: false; reasons: AutoMergeReason[] };

const RECORD_FILE = /^posts\/\d{4}\/[a-z0-9-]+\.json$/;
const HOUR_MS = 3_600_000;

/** The newest `posts/check` status, or null. */
function latestCheck(input: AutoMergeInput): { state: string; createdAt: Date } | null {
  const checks = input.statuses.filter(
    (s) => s.context === CHECK_CONTEXT && s.sha === input.headSha,
  );
  checks.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return checks[0] ?? null;
}

/** True for a comment that approves exactly this head SHA (T13). */
export function isApprovalComment(
  comment: { body: string; login: string },
  headSha: string,
  ownerLogin: string,
): boolean {
  const firstLine = comment.body.split(/\r?\n/, 1)[0]?.trim();
  return (
    comment.login === ownerLogin && firstLine === REVIEW_MARKER && comment.body.includes(headSha)
  );
}

export function autoMergeDecision(input: AutoMergeInput): AutoMergeDecision {
  const reasons: AutoMergeReason[] = [];
  const check = latestCheck(input);
  if (!check) reasons.push("check-missing");
  else if (check.state !== "success") reasons.push("check-not-success");

  // The approval must come after the successful check of this SHA, from the owner's login.
  const checkAt = check?.state === "success" ? check.createdAt.getTime() : null;
  const approved = input.comments.some(
    (c) =>
      isApprovalComment(c, input.headSha, input.ownerLogin) &&
      checkAt !== null &&
      c.createdAt.getTime() > checkAt,
  );
  if (!approved) reasons.push("no-approval");

  if (input.held) reasons.push("held");

  const post = input.postInstant.getTime();
  if (post - input.prOpenedAt.getTime() < VETO_WINDOW_H * HOUR_MS) reasons.push("opened-too-late");

  if (input.baseBranch !== "main") reasons.push("wrong-base");

  // Exactly one record file under posts/YYYY/, added or modified (no rename, no delete).
  const file = input.changedFiles.length === 1 ? input.changedFiles[0] : undefined;
  const only =
    file !== undefined &&
    file.filename === input.recordPath &&
    RECORD_FILE.test(file.filename) &&
    (file.status === "added" || file.status === "modified");
  if (!only) reasons.push("not-only-record");

  const now = input.now.getTime();
  if (now >= post) reasons.push("post-time-passed");
  else if (now < post - AUTO_MERGE_LEAD_H * HOUR_MS) reasons.push("too-early");

  return reasons.length === 0 ? { merge: true } : { merge: false, reasons };
}

/** Commit message of the squash merge; it ends with the trailer the publish check reads (T12). */
export function mergeCommitMessage(runId: string): string {
  if (!/^\d+$/.test(runId)) throw new Error("GITHUB_RUN_ID must be digits");
  return `Merged by the posts auto-merge workflow.\n\nPosts-Auto-Merge-Run: ${runId}`;
}
