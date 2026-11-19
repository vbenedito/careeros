import type { LedgerSession } from "@careeros/shared";
import { describe, expect, it } from "vitest";
import { agentTokensByModel, buildSessionRows, formatTokens } from "./sessions-view";

const agent = (model: "haiku" | "sonnet" | "opus", tokens: number) => ({
  model,
  work: "author" as const,
  kind: "code" as const,
  issue: null,
  pr: null,
  tokens,
  minutes: null,
  rounds: 1,
  findings: null,
  files: [],
  skills: [],
});

const session = (id: string, overrides: Partial<LedgerSession> = {}): LedgerSession => ({
  schema: 1,
  session: id,
  date: id.slice(0, 10),
  goal: `goal ${id}`,
  corrects: null,
  main: { tokens: 250000, measure: "estimate" },
  agents: [],
  ...overrides,
});

describe("sessions panel view model (ADM-09)", () => {
  it("ADM-09 sums sub-agent tokens by model, zero for unused models", () => {
    expect(agentTokensByModel([agent("opus", 100), agent("opus", 50), agent("haiku", 7)])).toEqual({
      haiku: 7,
      sonnet: 0,
      opus: 150,
    });
    expect(agentTokensByModel([])).toEqual({ haiku: 0, sonnet: 0, opus: 0 });
  });

  it("ADM-09 one row per session, newest first (date, then session id)", () => {
    const rows = buildSessionRows([
      session("2030-01-02-a"),
      session("2030-01-03-a"),
      session("2030-01-02-b"),
    ]);
    expect(rows.map((r) => r.id)).toEqual(["2030-01-03-a", "2030-01-02-b", "2030-01-02-a"]);
  });

  it("ADM-09 a row shows date, goal, main tokens with its measure, agent tokens by model and agent count", () => {
    const [row] = buildSessionRows([
      session("2030-01-02-a", {
        main: { tokens: 1234567, measure: "measured" },
        agents: [agent("sonnet", 1000), agent("opus", 20), agent("sonnet", 500)],
      }),
    ]);
    expect(row).toMatchObject({
      date: "2030-01-02",
      goal: "goal 2030-01-02-a",
      mainTokens: "1,234,567",
      mainMeasure: "measured",
      agentTokens: [
        { model: "sonnet", tokens: "1,500" },
        { model: "opus", tokens: "20" },
      ],
      agentCount: 3,
    });
  });

  it("ADM-09 unmeasured main tokens are null; a session without agents has none", () => {
    const [row] = buildSessionRows([
      session("2030-01-02-a", { main: { tokens: null, measure: "estimate" } }),
    ]);
    expect(row).toMatchObject({ mainTokens: null, agentTokens: [], agentCount: 0 });
  });

  it("ADM-05 a correction is shown on both rows; nothing is hidden", () => {
    const rows = buildSessionRows([
      session("2030-01-02-a"),
      session("2030-01-03-a", { corrects: "2030-01-02-a" }),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ corrects: "2030-01-02-a", correctedBy: [] });
    expect(rows[1]).toMatchObject({ corrects: null, correctedBy: ["2030-01-03-a"] });
  });

  it("ADM-09 formats token counts with thousands separators", () => {
    expect(formatTokens(0)).toBe("0");
    expect(formatTokens(1000)).toBe("1,000");
  });
});
