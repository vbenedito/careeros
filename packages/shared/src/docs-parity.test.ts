/**
 * The README shows the system-design flowchart of docs/architecture/overview.md (#32). The architecture
 * doc is the source; this test fails when the two copies drift apart.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const firstMermaid = (markdown: string) => /```mermaid\n[\s\S]*?```/.exec(markdown)?.[0];

describe("docs parity", () => {
  it("the README flowchart equals the system-design flowchart in docs/architecture/overview.md", () => {
    const architecture = read("docs/architecture/overview.md");
    const section = architecture.slice(architecture.indexOf("## System design (as implemented)"));
    const source = firstMermaid(section);
    expect(source).toBeDefined();
    expect(firstMermaid(read("README.md"))).toBe(source);
  });
});
