/**
 * ADM-10: view model of the cost-per-issue panel. Pure functions; the component only renders.
 */
import { LEDGER_MODELS, type LedgerModel, type LedgerSession } from "@careeros/shared";
import { formatTokens } from "./sessions-view";

export interface CostRow {
  /** Issue number, or null for the "No issue" row. */
  issue: number | null;
  label: string;
  byModel: Record<LedgerModel, string>;
  total: string;
  sessions: number;
}

export interface CostView {
  rows: CostRow[];
  /** The one line under the table (ADM-10): main-session tokens, never split across issues. */
  main: { tokens: string; notMeasured: number };
}

/** One row per issue (ascending), tokens by model summed over every agent record; "No issue" last. */
export function buildCostView(sessions: readonly LedgerSession[]): CostView {
  const byIssue = new Map<
    number | null,
    { sums: Record<LedgerModel, number>; sessions: Set<string> }
  >();
  let main = 0;
  let notMeasured = 0;
  for (const s of sessions) {
    if (s.main.tokens === null) notMeasured += 1;
    else main += s.main.tokens;
    for (const a of s.agents) {
      let entry = byIssue.get(a.issue);
      if (!entry) {
        entry = { sums: { haiku: 0, sonnet: 0, opus: 0 }, sessions: new Set() };
        byIssue.set(a.issue, entry);
      }
      entry.sums[a.model] += a.tokens;
      entry.sessions.add(s.session);
    }
  }
  const keys = [...byIssue.keys()].sort((a, b) => (a === null ? 1 : b === null ? -1 : a - b));
  const rows = keys.map((issue): CostRow => {
    const entry = byIssue.get(issue);
    const sums = entry?.sums ?? { haiku: 0, sonnet: 0, opus: 0 };
    const total = LEDGER_MODELS.reduce((n, m) => n + sums[m], 0);
    return {
      issue,
      label: issue === null ? "No issue" : `#${issue}`,
      byModel: {
        haiku: formatTokens(sums.haiku),
        sonnet: formatTokens(sums.sonnet),
        opus: formatTokens(sums.opus),
      },
      total: formatTokens(total),
      sessions: entry?.sessions.size ?? 0,
    };
  });
  return { rows, main: { tokens: formatTokens(main), notMeasured } };
}
