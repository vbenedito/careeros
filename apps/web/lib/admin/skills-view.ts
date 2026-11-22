/**
 * ADM-19: view model of the skills card. Counts agent records (not sessions, not uses) per kind of
 * work, after `corrects` is applied. A skill listed twice in one record counts once.
 */
import { LEDGER_KINDS, type LedgerKind, type LedgerSession } from "@careeros/shared";
import { effectiveSessions } from "./effective";

export const KIND_LABELS: Record<LedgerKind, string> = {
  code: "Code",
  ideas: "Ideas",
  docs: "Docs",
  marketing: "Marketing",
  video: "Video",
  post: "Post",
};

export const TOP_SKILLS = 3;

export interface SkillBar {
  /** The skill name, or "Other" / "No skill listed". */
  label: string;
  count: number;
  /** "Other" and "No skill listed" are drawn in the neutral colour. */
  neutral: boolean;
}

export interface KindSkills {
  kind: LedgerKind;
  label: string;
  /** Agent records of this kind. */
  records: number;
  bars: SkillBar[];
}

export interface SkillTableRow {
  kind: string;
  skill: string;
  records: number;
}

export interface SkillsView {
  kinds: KindSkills[];
  /** The largest bar count over all kinds: one scale for every bar. */
  max: number;
  /** No record lists any skill. */
  empty: boolean;
  headline: string | null;
  table: SkillTableRow[];
}

const byNameAsc = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function buildSkills(sessions: readonly LedgerSession[]): SkillsView {
  const records = new Map<LedgerKind, number>();
  const noSkill = new Map<LedgerKind, number>();
  const counts = new Map<LedgerKind, Map<string, number>>();
  for (const s of effectiveSessions(sessions)) {
    for (const a of s.agents) {
      records.set(a.kind, (records.get(a.kind) ?? 0) + 1);
      const skills = [...new Set(a.skills)];
      if (skills.length === 0) noSkill.set(a.kind, (noSkill.get(a.kind) ?? 0) + 1);
      const kindCounts = counts.get(a.kind) ?? new Map<string, number>();
      for (const skill of skills) kindCounts.set(skill, (kindCounts.get(skill) ?? 0) + 1);
      counts.set(a.kind, kindCounts);
    }
  }

  const kinds: KindSkills[] = [];
  const table: SkillTableRow[] = [];
  let best: { skill: string; kind: LedgerKind; n: number } | null = null;
  for (const kind of LEDGER_KINDS) {
    const entries = [...(counts.get(kind) ?? new Map<string, number>())].sort(
      ([an, ac], [bn, bc]) => bc - ac || byNameAsc(an, bn),
    );
    const bars: SkillBar[] = entries
      .slice(0, TOP_SKILLS)
      .map(([label, count]) => ({ label, count, neutral: false }));
    const other = entries.slice(TOP_SKILLS).reduce((n, [, c]) => n + c, 0);
    if (other > 0) bars.push({ label: "Other", count: other, neutral: true });
    const none = noSkill.get(kind) ?? 0;
    if (none > 0) bars.push({ label: "No skill listed", count: none, neutral: true });
    kinds.push({ kind, label: KIND_LABELS[kind], records: records.get(kind) ?? 0, bars });

    for (const [skill, n] of [...entries].sort(([a], [b]) => byNameAsc(a, b)))
      table.push({ kind: KIND_LABELS[kind], skill, records: n });
    if (none > 0) table.push({ kind: KIND_LABELS[kind], skill: "No skill listed", records: none });
    // Entries are sorted by count then name, and kinds come in order: the first strictly larger wins.
    const top = entries[0];
    if (top && (best === null || top[1] > best.n)) best = { skill: top[0], kind, n: top[1] };
  }
  const max = Math.max(0, ...kinds.flatMap((k) => k.bars.map((b) => b.count)));
  // "Ties: first by name, then by the kind order": compare names across kinds.
  let headlineBest = best;
  if (best !== null) {
    const top = best.n;
    const tied = kinds.flatMap((k) =>
      k.bars
        .filter((b) => !b.neutral && b.count === top)
        .map((b) => ({ skill: b.label, kind: k.kind, n: b.count })),
    );
    tied.sort(
      (a, b) =>
        byNameAsc(a.skill, b.skill) || LEDGER_KINDS.indexOf(a.kind) - LEDGER_KINDS.indexOf(b.kind),
    );
    headlineBest = tied[0] ?? best;
  }
  const empty = best === null;
  const headline =
    headlineBest === null
      ? null
      : `Most used: ${headlineBest.skill} (${headlineBest.n} ${headlineBest.n === 1 ? "record" : "records"}, ${KIND_LABELS[headlineBest.kind].toLowerCase()})`;
  return { kinds, max, empty, headline, table };
}
