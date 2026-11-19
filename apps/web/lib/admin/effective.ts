/**
 * ADM-05 (product owner, 2026-11-19): a ledger file with `corrects` replaces the session it names
 * in every total. The Sessions panel (ADM-09) still lists both files; the cost, reviews and docs
 * panels count only the sessions that no other present file corrects. A chain A <- B <- C counts
 * only C. A correction that names a missing file still counts itself.
 */
import type { LedgerSession } from "@careeros/shared";

export function effectiveSessions(sessions: readonly LedgerSession[]): LedgerSession[] {
  const corrected = new Set<string>();
  // A file that names itself is ignored as a correction (it would otherwise drop itself).
  for (const s of sessions) if (s.corrects && s.corrects !== s.session) corrected.add(s.corrects);
  return sessions.filter((s) => !corrected.has(s.session));
}
