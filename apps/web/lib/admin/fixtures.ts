/**
 * Synthetic ledger sessions for the admin tests and the screenshots. Invented values: nothing
 * here comes from the private ledger (ADM-07).
 */
import type { LedgerAgent, LedgerSession } from "@careeros/shared";

export const agent = (over: Partial<LedgerAgent>): LedgerAgent => ({
  model: "sonnet",
  work: "author",
  kind: "code",
  issue: null,
  pr: null,
  tokens: 0,
  minutes: null,
  rounds: 1,
  findings: null,
  files: [],
  skills: [],
  ...over,
});

export const session = (over: Partial<LedgerSession>): LedgerSession => ({
  schema: 1,
  session: "2030-01-02-a",
  date: "2030-01-02",
  goal: "fixture",
  corrects: null,
  main: { tokens: null, measure: "estimate" },
  agents: [],
  ...over,
});

/** Two sessions: issue 7 in both, issue 9 once, one record without an issue. */
export const TWO_SESSIONS: LedgerSession[] = [
  session({
    session: "2030-01-02-a",
    main: { tokens: 1000, measure: "estimate" },
    agents: [
      agent({
        model: "sonnet",
        issue: 7,
        pr: 70,
        tokens: 100,
        files: ["docs/a.md"],
        skills: ["x:one"],
      }),
      agent({ model: "opus", issue: 7, pr: 70, tokens: 300, files: ["docs/b.md", "docs/a.md"] }),
      agent({
        model: "sonnet",
        work: "review",
        issue: 7,
        pr: 70,
        tokens: 50,
        rounds: 2,
        findings: { high: 1, medium: 2 },
        skills: ["x:two"],
      }),
      agent({ model: "haiku", issue: null, tokens: 5 }),
    ],
  }),
  session({
    session: "2030-01-03-a",
    date: "2030-01-03",
    main: { tokens: null, measure: "estimate" },
    agents: [
      agent({ model: "haiku", issue: 7, tokens: 10, skills: ["x:one"] }),
      agent({
        model: "opus",
        work: "review",
        issue: 9,
        pr: 90,
        tokens: 200,
        rounds: 3,
        findings: { high: 0, medium: 1 },
      }),
      agent({
        model: "sonnet",
        work: "review",
        issue: 9,
        pr: 90,
        tokens: 80,
        rounds: 1,
        findings: { high: 2, medium: 0 },
      }),
      agent({ model: "sonnet", issue: 9, pr: 90, tokens: 40, files: ["specs/z.md"] }),
    ],
  }),
];
