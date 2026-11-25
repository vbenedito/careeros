/** PST-35: the I/O around `autoMergeDecision`: reads the open record PRs and merges the ready ones. */
import { PostRecordSchema, slotInstant } from "../../packages/shared/src/posts.ts";
import { type AutoMergeInput, autoMergeDecision, mergeCommitMessage } from "./automerge.ts";
import type { GitHubApi } from "./github.ts";
import { checkHold } from "./hold.ts";
import type { Out } from "./mask.ts";

const RECORD_PATH = /^posts\/\d{4}\/(\d{4}-\d{2}-\d{2}-[a-z0-9-]+)\.json$/;

export interface AutoMergeRun {
  gh: GitHubApi;
  now: Date;
  postTime: string;
  dryRun: boolean;
  runId: string;
  out: Out;
}

export async function runAutoMerge(r: AutoMergeRun): Promise<{ failures: number; merged: number }> {
  const ownerLogin = r.gh.repo.split("/")[0] ?? "";
  const result = { failures: 0, merged: 0 };
  for (const pull of await r.gh.listOpenPulls()) {
    const files = await r.gh.listPullFiles(pull.number);
    const only = files.length === 1 ? files[0] : undefined;
    const match = only ? RECORD_PATH.exec(only.filename) : null;
    if (!only || !match) continue; // not a record PR
    const stem = match[1] as string;
    const text = await r.gh.getFileText(only.filename, pull.head_sha);
    const record = PostRecordSchema.safeParse(text === null ? null : safeJson(text));
    if (!record.success) {
      r.out(`PR #${pull.number}: the record does not parse, not merged`);
      continue;
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
      r.out(`PR #${pull.number} ${stem}: ${r.dryRun ? "would merge" : "merging"}`);
      if (r.dryRun) continue;
      await r.gh.mergePull(pull.number, {
        sha: pull.head_sha,
        title: `feat(posts): ${stem} (#${pull.number})`,
        message: mergeCommitMessage(r.runId),
      });
      result.merged++;
      continue;
    }
    const codes = decision.reasons.join(",");
    r.out(`PR #${pull.number} ${stem}: not merged (${codes})`);
    // Only inside the merge window a failure counts and gets one comment per reason set.
    const inWindow =
      !decision.reasons.includes("too-early") && !decision.reasons.includes("post-time-passed");
    if (!inWindow) continue;
    result.failures++;
    if (r.dryRun) continue;
    const marker = `<!-- posts-auto-merge-reason:${codes}:${pull.head_sha} -->`;
    const seen = (await r.gh.listComments(pull.number)).some((c) => c.body.includes(marker));
    if (!seen) {
      await r.gh.createComment(
        pull.number,
        `${marker}\nNot merged yet: ${codes}.\nAdd the label \`hold\` to stop this post.`,
      );
    }
  }
  return result;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
