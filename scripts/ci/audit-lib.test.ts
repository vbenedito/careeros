import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { exceptionProblems } from "./audit-lib.ts";

const id = "GHSA-cfgh-2345-vwxc";
const today = "2026-11-13";

describe("ENV-08 audit exceptions", () => {
  it("ENV-08 accepts an empty list and a valid, unexpired entry", () => {
    expect(exceptionProblems({}, today)).toEqual([]);
    expect(
      exceptionProblems(
        { [id]: { reason: "No fix released yet; not reachable", expires: "2026-12-01" } },
        today,
      ),
    ).toEqual([]);
  });

  it("ENV-08 fails an expired exception", () => {
    const problems = exceptionProblems(
      { [id]: { reason: "No fix released yet; not reachable", expires: "2026-11-12" } },
      today,
    );
    expect(problems[0]).toContain("expired on 2026-11-12");
  });

  it("ENV-08 an exception expiring today is still valid", () => {
    expect(
      exceptionProblems(
        { [id]: { reason: "No fix released yet; not reachable", expires: today } },
        today,
      ),
    ).toEqual([]);
  });

  it("ENV-08 requires a GHSA id, a reason, an expiry and at most 90 days", () => {
    expect(
      exceptionProblems({ nope: { reason: "long enough reason", expires: "2026-12-01" } }, today),
    ).toHaveLength(1);
    expect(
      exceptionProblems({ [id]: { reason: "short", expires: "2026-12-01" } }, today),
    ).toHaveLength(1);
    expect(exceptionProblems({ [id]: { reason: "long enough reason" } }, today)).toHaveLength(1);
    expect(
      exceptionProblems({ [id]: { reason: "long enough reason", expires: "2027-06-01" } }, today),
    ).toHaveLength(1);
    expect(exceptionProblems([], today)).toHaveLength(1);
  });

  it("ENV-08 the committed exception list is valid today", () => {
    const file = resolve(import.meta.dirname, "../../.github/audit-exceptions.json");
    const data: unknown = JSON.parse(readFileSync(file, "utf8"));
    expect(exceptionProblems(data, new Date().toISOString().slice(0, 10))).toEqual([]);
  });
});
