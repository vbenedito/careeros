/**
 * ADM-09: view model of the sessions panel. Pure functions; the component only renders.
 */
import {
  LEDGER_MODELS,
  type LedgerAgent,
  type LedgerModel,
  type LedgerSession,
} from "@careeros/shared";

/**
 * Whole numbers with thousands separators ("1,234,567"). `compact` gives "1.2M" for chart
 * headlines and axis ticks (ADM-10a), where a full number would not fit.
 */
export function formatTokens(tokens: number, compact = false): string {
  return compact
    ? new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(
        tokens,
      )
    : new Intl.NumberFormat("en-US").format(tokens);
}

/** Sub-agent tokens summed per model; every model is present, zero when unused. */
export function agentTokensByModel(
  agents: readonly Pick<LedgerAgent, "model" | "tokens">[],
): Record<LedgerModel, number> {
  const sums: Record<LedgerModel, number> = { haiku: 0, sonnet: 0, opus: 0 };
  for (const agent of agents) sums[agent.model] += agent.tokens;
  return sums;
}

export interface SessionRow {
  id: string;
  date: string;
  goal: string;
  /** `null` when the main session's tokens were not measured. */
  mainTokens: string | null;
  mainMeasure: "estimate" | "measured";
  /** Only the models that were used, in haiku, sonnet, opus order. */
  agentTokens: { model: LedgerModel; tokens: string }[];
  agentCount: number;
  /** The session this file corrects (ADM-05), if any. */
  corrects: string | null;
  /** Sessions whose files correct this one. */
  correctedBy: string[];
}

/** One row per session, newest first (date, then session id, descending). */
export function buildSessionRows(sessions: readonly LedgerSession[]): SessionRow[] {
  const correctedBy = new Map<string, string[]>();
  for (const s of sessions) {
    if (s.corrects)
      correctedBy.set(s.corrects, [...(correctedBy.get(s.corrects) ?? []), s.session]);
  }
  return [...sessions]
    .sort((a, b) => b.date.localeCompare(a.date) || b.session.localeCompare(a.session))
    .map((s) => {
      const sums = agentTokensByModel(s.agents);
      return {
        id: s.session,
        date: s.date,
        goal: s.goal,
        mainTokens: s.main.tokens === null ? null : formatTokens(s.main.tokens),
        mainMeasure: s.main.measure,
        agentTokens: LEDGER_MODELS.filter((m) => s.agents.some((a) => a.model === m)).map((m) => ({
          model: m,
          tokens: formatTokens(sums[m]),
        })),
        agentCount: s.agents.length,
        corrects: s.corrects,
        correctedBy: (correctedBy.get(s.session) ?? []).sort(),
      };
    });
}
