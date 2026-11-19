import { describe, expect, it } from "vitest";
import { buildIssueDocs } from "./docs-view";
import { agent, session, TWO_SESSIONS } from "./fixtures";

describe("docs Claude sees, per issue (ADM-13)", () => {
  it("ADM-13 the union of files and skills over every record of an issue, sorted", () => {
    expect(buildIssueDocs(TWO_SESSIONS)).toEqual([
      { issue: 7, files: ["docs/a.md", "docs/b.md"], skills: ["x:one", "x:two"] },
      { issue: 9, files: ["specs/z.md"], skills: [] },
    ]);
  });

  it("ADM-13 records without an issue add no row", () => {
    expect(
      buildIssueDocs([session({ agents: [agent({ issue: null, files: ["a.md"] })] })]),
    ).toEqual([]);
  });
});
