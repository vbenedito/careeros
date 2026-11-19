import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildCostView } from "@/lib/admin/cost-view";
import { buildIssueDocs } from "@/lib/admin/docs-view";
import { agent, session, TWO_SESSIONS } from "@/lib/admin/fixtures";
import { buildProgress } from "@/lib/admin/progress-view";
import { buildReviewRows } from "@/lib/admin/reviews-view";
import { CostPanel } from "./cost-panel";
import { DIAGRAM_EDGES, DiagramPanel } from "./diagram-panel";
import { DOCS_MAP } from "./docs-map";
import { DocsPanel } from "./docs-panel";
import { ProgressPanel } from "./progress-panel";
import { ReviewsPanel } from "./reviews-panel";

const html = (node: React.ReactNode) => renderToStaticMarkup(<>{node}</>);

describe("admin panels render", () => {
  it("ADM-10 the cost table scrolls in its own box and the main line sits under it", () => {
    const markup = html(<CostPanel view={buildCostView(TWO_SESSIONS)} />);
    expect(markup).toContain("overflow-x-auto");
    expect(markup).toContain("No issue");
    expect(markup).toContain("Main sessions (estimate)");
    expect(markup.indexOf("</table>")).toBeLessThan(markup.indexOf("Main sessions (estimate)"));
    expect(markup).not.toMatch(/#[0-9a-f]{3,6}\b|rgb\(/i); // token classes only
  });

  it("ADM-10 ADM-08 an unavailable ledger shows the status only", () => {
    expect(html(<CostPanel unavailableNote="HTTP 401" />)).toContain(
      "Ledger unavailable (HTTP 401)",
    );
  });

  it("ADM-11 the reviews table shows rounds, findings, reviewer and merge state", () => {
    const rows = buildReviewRows(TWO_SESSIONS, new Map([[90, "merged"]]));
    const markup = html(<ReviewsPanel rows={rows} />);
    expect(markup).toContain("#90");
    expect(markup).toContain("Merged");
    expect(markup).toContain("Unknown");
    expect(markup).toContain("overflow-x-auto");
  });

  it("ADM-12 the progress panel shows four counts and the list; unavailable says why", () => {
    const view = buildProgress(
      [{ number: 5, title: "Fixture issue", state: "open", labels: ["v1"] }],
      [],
      {},
    );
    const markup = html(<ProgressPanel view={view} />);
    expect(markup).toContain("Waiting for approval");
    expect(markup).toContain("Fixture issue");
    expect(html(<ProgressPanel unavailableNote="HTTP 403" />)).toContain(
      "GitHub unavailable (HTTP 403)",
    );
  });

  it("ADM-13 the fixed map names the always-loaded docs and the per-kind docs", () => {
    const text = JSON.stringify(DOCS_MAP);
    for (const part of [
      "AGENTS.md",
      "docs/process/agents.md",
      "docs/marketing/",
      "docs/marketing/video-formats.md",
    ])
      expect(text).toContain(part);
    const markup = html(<DocsPanel rows={buildIssueDocs(TWO_SESSIONS)} />);
    expect(markup).toContain("Always loaded");
    expect(markup).toContain("docs/a.md, docs/b.md");
    expect(markup).toContain("x:one, x:two");
  });

  it("ADM-13 with no ledger the fixed map still shows", () => {
    const markup = html(<DocsPanel unavailableNote={null} />);
    expect(markup).toContain("Fixed map");
    expect(markup).toContain("Ledger unavailable");
  });

  it("ADM-15 the diagram is static, hand-written and labels every edge", () => {
    const nodes = new Set(DIAGRAM_EDGES.flatMap((e) => [e.from, e.to]));
    for (const n of [
      "Product owner",
      "Main session",
      "GitHub",
      "CI",
      "Vercel",
      "Supabase",
      "Chrome Web Store",
      "Connectors",
    ])
      expect(nodes.has(n), n).toBe(true);
    expect(nodes.has("Sub-agents (haiku, sonnet, opus)")).toBe(true);
    expect(DIAGRAM_EDGES.every((e) => e.label.length > 0)).toBe(true);
    expect(DIAGRAM_EDGES.some((e) => e.label.includes("migrate.yml"))).toBe(true);
    const markup = html(<DiagramPanel />);
    for (const e of DIAGRAM_EDGES) expect(markup).toContain(e.label.replace("&", "&amp;"));
    expect(markup).not.toContain("<script");
    expect(markup).not.toContain("<svg"); // HTML and token classes only, no library
  });

  it("ADM-04 the panels hold no form or button", () => {
    const markup = html(
      <>
        <CostPanel view={buildCostView([session({ agents: [agent({ issue: 1, tokens: 1 })] })])} />
        <DiagramPanel />
      </>,
    );
    for (const w of ["<form", "<button"]) expect(markup).not.toContain(w);
  });
});

describe("admin static content is public-safe (ADM-07)", () => {
  it("ADM-07 fixtures, docs map and diagram hold no email, URL or token-like text", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const root = join(__dirname, "..", "..");
    const text = [
      readFileSync(join(root, "lib/admin/fixtures.ts"), "utf8"),
      readFileSync(join(root, "app/admin/docs-map.ts"), "utf8"),
      JSON.stringify(DIAGRAM_EDGES),
      JSON.stringify(DOCS_MAP),
      html(<DiagramPanel />),
    ].join("\n");
    expect(text).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/); // email
    expect(text).not.toMatch(/https?:\/\//i); // URL
    expect(text).not.toMatch(/ghp_|github_pat_|\bsk-|eyJ/); // token-like
  });
});
