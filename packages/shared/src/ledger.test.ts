import { describe, expect, it } from "vitest";
import { LedgerSessionSchema } from "./ledger";

/** Synthetic session in the ADM-06 shape; not taken from the private ledger. */
const valid = () => ({
  schema: 1,
  session: "2030-01-02-a",
  date: "2030-01-02",
  goal: "fixture session",
  corrects: null,
  main: { tokens: 1000, measure: "estimate" },
  agents: [
    {
      model: "opus",
      work: "author",
      kind: "code",
      issue: 7,
      pr: 8,
      tokens: 500,
      minutes: null,
      rounds: 1,
      findings: null,
      files: ["docs/example.md"],
      skills: ["some:skill"],
    },
  ],
});

describe("ledger schema v1 (ADM-06)", () => {
  it("ADM-06 accepts a valid session, with nulls where the spec allows them", () => {
    expect(LedgerSessionSchema.safeParse(valid()).success).toBe(true);
    const nulls = valid();
    Object.assign(nulls.main, { tokens: null, measure: "measured" });
    Object.assign(nulls.agents[0] ?? {}, { issue: null, pr: null, minutes: 3 });
    expect(LedgerSessionSchema.safeParse(nulls).success).toBe(true);
    const review = valid();
    Object.assign(review.agents[0] ?? {}, { work: "review", findings: { high: 0, medium: 2 } });
    expect(LedgerSessionSchema.safeParse(review).success).toBe(true);
    expect(LedgerSessionSchema.safeParse({ ...valid(), agents: [] }).success).toBe(true);
  });

  it("ADM-06 rejects a wrong schema version, model, work, kind, measure or date", () => {
    const bad = (change: (v: ReturnType<typeof valid>) => void) => {
      const value = valid();
      change(value);
      return LedgerSessionSchema.safeParse(value).success;
    };
    expect(bad((v) => Object.assign(v, { schema: 2 }))).toBe(false);
    expect(bad((v) => Object.assign(v.agents[0] ?? {}, { model: "gpt" }))).toBe(false);
    expect(bad((v) => Object.assign(v.agents[0] ?? {}, { work: "plan" }))).toBe(false);
    expect(bad((v) => Object.assign(v.agents[0] ?? {}, { kind: "ads" }))).toBe(false);
    expect(bad((v) => Object.assign(v.main, { measure: "guess" }))).toBe(false);
    expect(bad((v) => Object.assign(v, { date: "2030-13-40" }))).toBe(false);
    expect(bad((v) => Object.assign(v.agents[0] ?? {}, { tokens: -1 }))).toBe(false);
    expect(bad((v) => Object.assign(v.agents[0] ?? {}, { tokens: 1.5 }))).toBe(false);
    expect(bad((v) => Object.assign(v, { session: "bad id" }))).toBe(false);
  });

  it("ADM-06 rejects missing fields", () => {
    for (const key of ["schema", "session", "date", "goal", "corrects", "main", "agents"]) {
      const value: Record<string, unknown> = valid();
      delete value[key];
      expect(LedgerSessionSchema.safeParse(value).success, key).toBe(false);
    }
  });

  it("ADM-06 rejects unknown extra keys at every level (strict)", () => {
    const top = { ...valid(), extra: 1 };
    expect(LedgerSessionSchema.safeParse(top).success).toBe(false);
    const main = valid();
    Object.assign(main.main, { note: "x" });
    expect(LedgerSessionSchema.safeParse(main).success).toBe(false);
    const agent = valid();
    Object.assign(agent.agents[0] ?? {}, { cost_usd: 3 });
    expect(LedgerSessionSchema.safeParse(agent).success).toBe(false);
    const findings = valid();
    Object.assign(findings.agents[0] ?? {}, { findings: { high: 0, medium: 0, low: 1 } });
    expect(LedgerSessionSchema.safeParse(findings).success).toBe(false);
  });
});
