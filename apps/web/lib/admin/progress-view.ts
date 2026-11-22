/**
 * ADM-12: view model of the v1 progress panel, and the merge state of ADM-11. Pure functions over
 * plain values read from GitHub.
 */
import { REQUIRED_CHECKS } from "./config";
import type { MergeState } from "./reviews-view";

export interface RepoIssue {
  number: number;
  title: string;
  state: "open" | "closed";
  labels: string[];
}

export interface RepoPr {
  number: number;
  state: "open" | "closed";
  draft: boolean;
  merged: boolean;
  body: string;
  headSha: string;
}

export interface CheckRun {
  name: string;
  /** `null` while the run has not finished. */
  conclusion: string | null;
}

export const PROGRESS_GROUPS = ["done", "waiting", "blocked", "open"] as const;
export type ProgressGroup = (typeof PROGRESS_GROUPS)[number];

export const GROUP_LABELS: Record<ProgressGroup, string> = {
  done: "Done",
  waiting: "Waiting for approval",
  blocked: "Blocked",
  open: "Open",
};

export interface ProgressItem {
  number: number;
  title: string;
  /** The PR that waits for approval, in the "waiting" group only. */
  pr: number | null;
}

export type ProgressView = Record<ProgressGroup, ProgressItem[]>;

/** Issue numbers a PR body closes: `Closes #N` (any case; one or more). */
export function closedIssues(body: string): number[] {
  return [...body.matchAll(/\bcloses\s+#(\d+)\b/gi)].map((m) => Number(m[1]));
}

/** Both required checks (ADM-12) finished with `success`. */
export function requiredChecksGreen(runs: readonly CheckRun[]): boolean {
  return REQUIRED_CHECKS.every((name) =>
    runs.some((r) => r.name === name && r.conclusion === "success"),
  );
}

/** An open, non-draft PR is a candidate for "waiting for approval" before its checks are read. */
export function isReviewCandidate(pr: RepoPr): boolean {
  return pr.state === "open" && !pr.draft;
}

/**
 * Each issue lands in one group, the first that fits: done (closed), waiting (an open, non-draft
 * PR with `Closes #N` and both required checks green), blocked (label `blocked`), open.
 */
export function buildProgress(
  issues: readonly RepoIssue[],
  prs: readonly RepoPr[],
  checks: Readonly<Record<string, readonly CheckRun[]>>,
): ProgressView {
  const waitingPr = new Map<number, number>();
  for (const pr of prs) {
    if (!isReviewCandidate(pr) || !requiredChecksGreen(checks[pr.headSha] ?? [])) continue;
    for (const n of closedIssues(pr.body)) if (!waitingPr.has(n)) waitingPr.set(n, pr.number);
  }
  const view: ProgressView = { done: [], waiting: [], blocked: [], open: [] };
  for (const issue of [...issues].sort((a, b) => a.number - b.number)) {
    const pr = waitingPr.get(issue.number) ?? null;
    const group: ProgressGroup =
      issue.state === "closed"
        ? "done"
        : pr !== null
          ? "waiting"
          : issue.labels.includes("blocked")
            ? "blocked"
            : "open";
    view[group].push({
      number: issue.number,
      title: issue.title,
      pr: group === "waiting" ? pr : null,
    });
  }
  return view;
}

/** Merge state of every PR read from GitHub (ADM-11). */
export function mergeStates(prs: readonly RepoPr[]): Map<number, MergeState> {
  return new Map(
    prs.map((pr): [number, MergeState] => [
      pr.number,
      pr.merged ? "merged" : pr.state === "closed" ? "closed" : pr.draft ? "draft" : "open",
    ]),
  );
}

/** ADM-12: "12 of 30 v1 issues are done (40%)"; "No v1 issues yet." when there are none. */
export function progressHeadline(view: ProgressView): string {
  const total = PROGRESS_GROUPS.reduce((n, g) => n + view[g].length, 0);
  if (total === 0) return "No v1 issues yet.";
  const done = view.done.length;
  return `${done} of ${total} v1 ${total === 1 ? "issue is" : "issues are"} done (${Math.round((done / total) * 100)}%)`;
}
