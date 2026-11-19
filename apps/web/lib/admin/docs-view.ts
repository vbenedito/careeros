/**
 * ADM-13 (b): the files and skills each issue's agents were given, from the ledger.
 */
import type { LedgerSession } from "@careeros/shared";
import { effectiveSessions } from "./effective";

export interface IssueDocsRow {
  issue: number;
  files: string[];
  skills: string[];
}

/** Union of `files` and of `skills` over every agent record with that issue; issues ascending. */
export function buildIssueDocs(sessions: readonly LedgerSession[]): IssueDocsRow[] {
  const byIssue = new Map<number, { files: Set<string>; skills: Set<string> }>();
  for (const s of effectiveSessions(sessions)) {
    for (const a of s.agents) {
      if (a.issue === null) continue;
      const entry = byIssue.get(a.issue) ?? { files: new Set(), skills: new Set() };
      for (const f of a.files) entry.files.add(f);
      for (const k of a.skills) entry.skills.add(k);
      byIssue.set(a.issue, entry);
    }
  }
  return [...byIssue.entries()]
    .sort(([a], [b]) => a - b)
    .map(([issue, e]) => ({
      issue,
      files: [...e.files].sort(),
      skills: [...e.skills].sort(),
    }));
}
