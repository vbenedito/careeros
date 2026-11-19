import type { LedgerSession } from "@careeros/shared";
import { describe, expect, it } from "vitest";
import { buildCostView } from "./cost-view";
import { effectiveSessions } from "./effective";
import { agent, session } from "./fixtures";

describe("ledger corrections (ADM-05)", () => {
  it("ADM-05 a correction replaces the session it names; a chain counts only the last file", () => {
    const a = session({ session: "2030-01-01-a" });
    const b = session({ session: "2030-01-02-a", corrects: "2030-01-01-a" });
    const c = session({ session: "2030-01-03-a", corrects: "2030-01-02-a" });
    expect(effectiveSessions([a, b, c]).map((s: LedgerSession) => s.session)).toEqual([
      "2030-01-03-a",
    ]);
  });

  it("ADM-05 a correction naming a missing file still counts; totals are not doubled", () => {
    const a = session({ session: "2030-01-01-a" });
    const fix = session({ session: "2030-01-02-a", corrects: "2030-01-01-a" });
    const orphan = session({ session: "2030-01-03-a", corrects: "2029-12-31-a" });
    expect(effectiveSessions([a, fix, orphan]).map((s) => s.session)).toEqual([
      "2030-01-02-a",
      "2030-01-03-a",
    ]);
    const withAgents = (id: string, tokens: number, corrects: string | null = null) =>
      session({ session: id, corrects, agents: [agent({ issue: 7, tokens })] });
    const first = withAgents("2030-01-01-a", 1000);
    const corrected = withAgents("2030-01-02-a", 1500, "2030-01-01-a");
    const view = buildCostView([first, corrected]);
    expect(view).toEqual(buildCostView([corrected]));
    expect(view.rows).toHaveLength(1);
    expect(view.rows[0]?.sessions).toBe(1);
  });
});
