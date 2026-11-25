/**
 * PST-36 (T14): the label `hold` on the record's PR (open or merged) or on any open issue whose
 * title contains the stem stops the post. A hold cannot recall a post that is already public.
 */
import type { GitHubApi } from "./github.ts";

export const HOLD_LABEL = "hold";

export type HoldResult = { held: false } | { held: true; source: string };

export async function checkHold(
  gh: GitHubApi,
  input: { stem: string; prNumber: number | null },
): Promise<HoldResult> {
  if (input.prNumber !== null) {
    // Labels can be added to a merged PR, so the PR is read again each time.
    const pull = await gh.getPull(input.prNumber);
    if (pull.labels.includes(HOLD_LABEL)) return { held: true, source: `PR #${input.prNumber}` };
  }
  const issues = await gh.listOpenIssues();
  const issue = issues.find((i) => i.title.includes(input.stem) && i.labels.includes(HOLD_LABEL));
  return issue ? { held: true, source: `issue #${issue.number}` } : { held: false };
}
