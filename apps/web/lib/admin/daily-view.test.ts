import { describe, expect, it } from "vitest";
import { addDays, adminToday, axisTicks, buildDailyCost, shortDate } from "./daily-view";
import { agent, session } from "./fixtures";

// 2030-01-20 12:00 in São Paulo (UTC-3).
const NOW = new Date("2030-01-20T15:00:00Z");

/** One session per day over 20 days (2030-01-01 .. 2030-01-20): haiku 1, sonnet 10, opus 100 * day. */
const twenty = () =>
  Array.from({ length: 20 }, (_, i) => {
    const day = String(i + 1).padStart(2, "0");
    return session({
      session: `2030-01-${day}-a`,
      date: `2030-01-${day}`,
      agents: [
        agent({ model: "haiku", tokens: i + 1 }),
        agent({ model: "sonnet", tokens: 10 * (i + 1) }),
        agent({ model: "opus", tokens: 100 * (i + 1) }),
      ],
    });
  });

describe("agent cost chart view (ADM-10a)", () => {
  it("ADM-10a 20 days of ledger give 14 columns, today last, with the sums per model", () => {
    const view = buildDailyCost(twenty(), NOW);
    expect(view.days).toHaveLength(14);
    expect(view.days[0]?.date).toBe("2030-01-07");
    expect(view.days[13]?.date).toBe("2030-01-20");
    expect(view.days[13]?.byModel).toEqual({ haiku: 20, sonnet: 200, opus: 2000 });
    expect(view.days[13]?.total).toBe(2220);
    expect(view.days[0]?.byModel).toEqual({ haiku: 7, sonnet: 70, opus: 700 });
    // 7 + ... + 20 = 189 days-sum, times 111 tokens per unit.
    expect(view.totalTokens).toBe(189 * 111);
    expect(view.records).toBe(14 * 3);
  });

  it("ADM-10a a day without a session is an empty column, not a gap", () => {
    const view = buildDailyCost(
      [session({ date: "2030-01-18", agents: [agent({ model: "sonnet", tokens: 50 })] })],
      NOW,
    );
    expect(view.days).toHaveLength(14);
    expect(view.days.filter((d) => d.total === 0)).toHaveLength(13);
    expect(view.days.find((d) => d.date === "2030-01-19")?.total).toBe(0);
    expect(view.days.find((d) => d.date === "2030-01-18")?.byModel.sonnet).toBe(50);
  });

  it("ADM-10a a session counts on its ledger date; days outside the window are dropped", () => {
    const view = buildDailyCost(
      [
        session({ session: "2030-01-06-a", date: "2030-01-06", agents: [agent({ tokens: 9 })] }),
        session({ session: "2030-01-21-a", date: "2030-01-21", agents: [agent({ tokens: 9 })] }),
        session({ session: "2030-01-07-a", date: "2030-01-07", agents: [agent({ tokens: 5 })] }),
      ],
      NOW,
    );
    expect(view.totalTokens).toBe(5);
    expect(view.days[0]?.total).toBe(5);
  });

  it("ADM-10a a corrects file replaces the session it names", () => {
    const old = session({
      session: "2030-01-19-a",
      date: "2030-01-19",
      agents: [agent({ model: "opus", tokens: 1000 })],
    });
    const fix = session({
      session: "2030-01-19-b",
      date: "2030-01-19",
      corrects: "2030-01-19-a",
      agents: [agent({ model: "opus", tokens: 400 })],
    });
    const view = buildDailyCost([old, fix], NOW);
    expect(view.days.find((d) => d.date === "2030-01-19")?.byModel.opus).toBe(400);
    expect(view.totalTokens).toBe(400);
  });

  it("ADM-10a today is the date in America/Sao_Paulo, not in UTC", () => {
    // 02:00 UTC on the 21st is still 23:00 on the 20th in São Paulo.
    expect(adminToday(new Date("2030-01-21T02:00:00Z"))).toBe("2030-01-20");
    expect(adminToday(new Date("2030-01-21T03:00:00Z"))).toBe("2030-01-21");
    const view = buildDailyCost([], new Date("2030-01-21T02:00:00Z"));
    expect(view.days[13]?.date).toBe("2030-01-20");
    expect(addDays("2030-03-01", -1)).toBe("2030-02-28");
    expect(addDays("2030-01-01", -1)).toBe("2029-12-31");
  });

  it("ADM-10a headline: total in 14 days and the model with the most; ties name the larger model", () => {
    const view = buildDailyCost(twenty(), NOW);
    expect(view.headline).toBe("21K tokens in 14 days, mostly opus");
    expect(view.topModel).toBe("opus");
    const tie = buildDailyCost(
      [
        session({
          date: "2030-01-20",
          agents: [agent({ model: "haiku", tokens: 100 }), agent({ model: "sonnet", tokens: 100 })],
        }),
      ],
      NOW,
    );
    expect(tie.topModel).toBe("sonnet");
    expect(tie.headline).toBe("200 tokens in 14 days, mostly sonnet");
    const all = buildDailyCost(
      [
        session({
          date: "2030-01-20",
          agents: ["haiku", "sonnet", "opus"].map((model) =>
            agent({ model: model as "haiku", tokens: 5 }),
          ),
        }),
      ],
      NOW,
    );
    expect(all.topModel).toBe("opus");
  });

  it("ADM-10a empty: no agent record in the 14 days", () => {
    const view = buildDailyCost(
      [session({ date: "2030-01-05", agents: [agent({ tokens: 5 })] }), session({ agents: [] })],
      NOW,
    );
    expect(view.records).toBe(0);
    expect(view.totalTokens).toBe(0);
    expect(view.topModel).toBeNull();
  });

  it("ADM-10a the axis has 0 and two round ticks, written with formatTokens; dates read '21 Nov'", () => {
    expect(axisTicks(2220)).toEqual({ top: 4000, ticks: [0, 2000, 4000] });
    expect(axisTicks(0)).toEqual({ top: 2, ticks: [0, 1, 2] });
    expect(axisTicks(1)).toEqual({ top: 2, ticks: [0, 1, 2] });
    expect(axisTicks(1000)).toEqual({ top: 1000, ticks: [0, 500, 1000] });
    expect(axisTicks(1_150_000).top).toBe(2_000_000);
    expect(axisTicks(7).ticks).toEqual([0, 4, 8]);
    expect(shortDate("2030-11-21")).toBe("21 Nov");
    expect(shortDate("2030-01-05")).toBe("5 Jan");
    expect(buildDailyCost(twenty(), NOW).days[13]?.label).toBe("20 Jan");
  });
});
