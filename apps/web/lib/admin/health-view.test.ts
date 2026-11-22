import { describe, expect, it } from "vitest";
import {
  buildHealth,
  formatAge,
  type HealthInput,
  statusOfConclusion,
  WORKFLOWS,
  type WorkflowResult,
} from "./health-view";

const NOW = new Date("2030-01-20T12:00:00Z");
const ago = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000).toISOString();
const run = (conclusion: string | null, hours: number): WorkflowResult => ({
  ok: true,
  run: { status: "completed", conclusion, updatedAt: ago(hours) },
});
const inputs = (over: Record<string, WorkflowResult>): HealthInput[] =>
  WORKFLOWS.map((w) => ({ file: w.file, result: over[w.file] ?? run("success", 1) }));
const row = (over: Record<string, WorkflowResult>, file: string) =>
  buildHealth(inputs(over), NOW).rows.find((r) => r.file === file);

describe("production health view (ADM-18)", () => {
  it("ADM-18 six workflows in the written order, with their names", () => {
    expect(buildHealth(inputs({}), NOW).rows.map((r) => [r.file, r.name])).toEqual([
      ["smoke.yml", "Site check"],
      ["health.yml", "Daily health check"],
      ["backup.yml", "Weekly backup"],
      ["migrate.yml", "Database migrations"],
      ["ci.yml", "CI"],
      ["codeql.yml", "Code scanning"],
    ]);
  });

  it("ADM-18 conclusions map to Passing, Failing, Cancelled and Unknown", () => {
    expect(statusOfConclusion("success")).toBe("passing");
    for (const c of ["failure", "timed_out", "startup_failure"])
      expect(statusOfConclusion(c)).toBe("failing");
    for (const c of ["cancelled", "skipped"]) expect(statusOfConclusion(c)).toBe("cancelled");
    for (const c of ["neutral", "action_required", "stale", null])
      expect(statusOfConclusion(c)).toBe("unknown");
  });

  it("ADM-18 each status word: Passing, Failing, Stale, Cancelled, No run yet, Unknown", () => {
    const view = buildHealth(
      inputs({
        "smoke.yml": run("success", 3),
        "health.yml": run("failure", 3),
        "backup.yml": run("success", 9 * 24),
        "migrate.yml": run("cancelled", 3),
        "ci.yml": { ok: true, run: null },
        "codeql.yml": { ok: false, httpStatus: 403 },
      }),
      NOW,
    );
    expect(view.rows.map((r) => r.word)).toEqual([
      "Passing",
      "Failing",
      "Stale",
      "Cancelled",
      "No run yet",
      "Unknown",
    ]);
    expect(view.rows[5]?.httpNote).toBe("HTTP 403");
    expect(view.rows.map((r) => r.needsAttention)).toEqual([false, true, true, true, true, true]);
  });

  it("ADM-18 the age is now minus updated_at, written in plain words", () => {
    expect(row({ "smoke.yml": run("success", 3) }, "smoke.yml")?.age).toBe("3 hours ago");
    expect(row({ "smoke.yml": run("success", 1) }, "smoke.yml")?.age).toBe("1 hour ago");
    expect(row({ "smoke.yml": run("success", 72) }, "smoke.yml")?.age).toBe("3 days ago");
    expect(formatAge(20_000)).toBe("just now");
    expect(formatAge(5 * 60_000)).toBe("5 minutes ago");
  });

  it("ADM-18 limits: site and daily check 36 hours, backup 8 days; a passing run past it is Stale", () => {
    expect(row({ "smoke.yml": run("success", 35) }, "smoke.yml")?.status).toBe("passing");
    expect(row({ "smoke.yml": run("success", 37) }, "smoke.yml")?.status).toBe("stale");
    expect(row({ "health.yml": run("success", 37) }, "health.yml")?.status).toBe("stale");
    expect(row({}, "smoke.yml")?.limit).toBe("limit 36 hours");
    expect(row({}, "backup.yml")?.limit).toBe("limit 8 days");
    expect(row({ "backup.yml": run("success", 7 * 24) }, "backup.yml")?.status).toBe("passing");
    expect(row({ "backup.yml": run("success", 8 * 24 + 1) }, "backup.yml")?.status).toBe("stale");
    // A failing run is Failing, never Stale, however old.
    expect(row({ "smoke.yml": run("failure", 100) }, "smoke.yml")?.status).toBe("failing");
  });

  it("ADM-18 the age bar fills to the limit and stops at 100%", () => {
    expect(row({ "smoke.yml": run("success", 18) }, "smoke.yml")?.barPercent).toBe(50);
    expect(row({ "smoke.yml": run("success", 500) }, "smoke.yml")?.barPercent).toBe(100);
  });

  it("ADM-18 migrations, CI and code scanning have no limit and no bar", () => {
    for (const file of ["migrate.yml", "ci.yml", "codeql.yml"]) {
      const r = row({}, file);
      expect(r?.limit).toBeNull();
      expect(r?.barPercent).toBeNull();
    }
    expect(row({}, "migrate.yml")?.note).toBe("Runs when a migration is merged");
    expect(row({ "migrate.yml": run("success", 24 * 90) }, "migrate.yml")?.status).toBe("passing");
    expect(row({ "ci.yml": run("success", 24 * 90) }, "ci.yml")?.status).toBe("passing");
  });

  it("ADM-18 a failed backup after a good one shows Failing and the last good backup", () => {
    const failed = row(
      {
        "backup.yml": {
          ok: true,
          run: { status: "completed", conclusion: "failure", updatedAt: ago(2) },
          lastGood: { status: "completed", conclusion: "success", updatedAt: ago(72) },
        },
      },
      "backup.yml",
    );
    expect(failed?.status).toBe("failing");
    expect(failed?.age).toBe("2 hours ago");
    expect(failed?.lastGood).toBe("last good backup 3 days ago");
    // The bar is the freshness of the last good run: 3 of 8 days.
    expect(failed?.barPercent).toBe(38);
    // When the newest run is the good one, there is no second line.
    const good = { status: "completed", conclusion: "success", updatedAt: ago(2) };
    expect(
      row({ "backup.yml": { ok: true, run: good, lastGood: good } }, "backup.yml")?.lastGood,
    ).toBeNull();
  });

  it("ADM-18 headline: all fine, or the count and the names in row order", () => {
    expect(buildHealth(inputs({}), NOW).headline).toBe("All 6 checks are fine");
    const two = buildHealth(
      inputs({ "smoke.yml": run("failure", 1), "backup.yml": run("failure", 1) }),
      NOW,
    );
    expect(two.headline).toBe("2 of 6 need attention: Site check, Weekly backup");
    expect(buildHealth(inputs({ "ci.yml": run("failure", 1) }), NOW).headline).toBe(
      "1 of 6 needs attention: CI",
    );
  });

  it("ADM-18 ADM-17 one failing request leaves the other rows; all failing makes the card unavailable", () => {
    const one = buildHealth(inputs({ "ci.yml": { ok: false, httpStatus: 500 } }), NOW);
    expect(one.unavailable).toBeNull();
    expect(one.rows.filter((r) => r.status === "passing")).toHaveLength(5);
    const all = buildHealth(
      WORKFLOWS.map((w) => ({ file: w.file, result: { ok: false, httpStatus: 403 } as const })),
      NOW,
    );
    expect(all.unavailable).toEqual({ httpStatus: 403 });
  });

  it("ADM-18 a run with an unreadable date is Unknown", () => {
    const bad: WorkflowResult = {
      ok: true,
      run: { status: "completed", conclusion: "success", updatedAt: "not a date" },
    };
    expect(row({ "smoke.yml": bad }, "smoke.yml")?.status).toBe("unknown");
  });
});
