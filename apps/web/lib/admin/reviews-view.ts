/**
 * ADM-11: view model of the reviews panel: one row per PR that has review records.
 */
import { LEDGER_MODELS, type LedgerModel, type LedgerSession } from "@careeros/shared";

/** Merge state read from GitHub (ADM-12); `unknown` when GitHub could not be read or has no such PR. */
export type MergeState = "merged" | "open" | "draft" | "closed" | "unknown";

export interface ReviewRow {
  pr: number;
  /** Largest `rounds` of the PR's review records. */
  rounds: number;
  high: number;
  medium: number;
  /** Models of the review records, in haiku, sonnet, opus order. */
  reviewers: LedgerModel[];
  state: MergeState;
}

/**
 * One row per PR with at least one `review` record, newest PR first. Findings are first-round
 * counts per review record (ADM-06) and add up over the PR's reviewers; a record without
 * findings adds nothing.
 */
export function buildReviewRows(
  sessions: readonly LedgerSession[],
  states: ReadonlyMap<number, MergeState> | null,
): ReviewRow[] {
  const byPr = new Map<
    number,
    { rounds: number; high: number; medium: number; models: Set<LedgerModel> }
  >();
  // Records with `pr: null` are not shown: a review row needs a PR to name.
  for (const s of sessions) {
    for (const a of s.agents) {
      if (a.work !== "review" || a.pr === null) continue;
      const row = byPr.get(a.pr) ?? { rounds: 0, high: 0, medium: 0, models: new Set() };
      row.rounds = Math.max(row.rounds, a.rounds);
      row.high += a.findings?.high ?? 0;
      row.medium += a.findings?.medium ?? 0;
      row.models.add(a.model);
      byPr.set(a.pr, row);
    }
  }
  return [...byPr.entries()]
    .sort(([a], [b]) => b - a)
    .map(([pr, r]) => ({
      pr,
      rounds: r.rounds,
      high: r.high,
      medium: r.medium,
      reviewers: LEDGER_MODELS.filter((m) => r.models.has(m)),
      state: states?.get(pr) ?? "unknown",
    }));
}
