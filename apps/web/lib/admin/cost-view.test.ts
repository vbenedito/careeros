import { describe, expect, it } from "vitest";
import { buildCostView } from "./cost-view";
import { agent, session, TWO_SESSIONS } from "./fixtures";

describe("cost per issue (ADM-10)", () => {
  it("ADM-10 sums tokens by model over every record of an issue, with total and session count", () => {
    const { rows } = buildCostView(TWO_SESSIONS);
    expect(rows.map((r) => r.label)).toEqual(["#7", "#9", "No issue"]);
    expect(rows[0]).toMatchObject({
      byModel: { haiku: "10", sonnet: "150", opus: "300" },
      total: "460",
      sessions: 2,
    });
    expect(rows[1]).toMatchObject({
      byModel: { haiku: "0", sonnet: "120", opus: "200" },
      total: "320",
      sessions: 1,
    });
  });

  it("ADM-10 records without an issue are summed in one 'No issue' row, listed last", () => {
    const view = buildCostView([
      session({ agents: [agent({ issue: null, tokens: 5 }), agent({ issue: null, tokens: 7 })] }),
      session({ session: "2030-01-04-a", agents: [agent({ issue: 3, tokens: 1 })] }),
    ]);
    expect(view.rows.map((r) => r.label)).toEqual(["#3", "No issue"]);
    expect(view.rows[1]).toMatchObject({ total: "12", sessions: 1, issue: null });
  });

  it("ADM-10 main-session tokens are one separate total, not split across issues", () => {
    const view = buildCostView(TWO_SESSIONS);
    expect(view.main).toEqual({ tokens: "1,000", notMeasured: 1 });
    const issueTotal = view.rows.reduce((n, r) => n + Number(r.total.replaceAll(",", "")), 0);
    expect(issueTotal).toBe(460 + 320 + 5); // agents only
  });

  it("ADM-10 an empty ledger gives no rows and a zero main line", () => {
    expect(buildCostView([])).toEqual({ rows: [], main: { tokens: "0", notMeasured: 0 } });
  });
});
