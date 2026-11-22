import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildCostView } from "@/lib/admin/cost-view";
import { buildDailyCost } from "@/lib/admin/daily-view";
import { buildIssueDocs } from "@/lib/admin/docs-view";
import { agent, session, TWO_SESSIONS } from "@/lib/admin/fixtures";
import { buildHealth } from "@/lib/admin/health-view";
import { buildProgress, progressHeadline } from "@/lib/admin/progress-view";
import { buildReviewRows } from "@/lib/admin/reviews-view";
import { buildSkills } from "@/lib/admin/skills-view";
import { CostPanel } from "./cost-panel";
import { DIAGRAM_EDGES, DiagramPanel } from "./diagram-panel";
import { DOCS_MAP } from "./docs-map";
import { DocsPanel } from "./docs-panel";
import { HealthPanel } from "./health-panel";
import { ProgressPanel } from "./progress-panel";
import { ReviewsPanel } from "./reviews-panel";
import { SkillsPanel } from "./skills-panel";

const html = (node: React.ReactNode) => renderToStaticMarkup(<>{node}</>);
const NOW = new Date("2030-01-04T15:00:00Z");
const costProps = (sessions: Parameters<typeof buildCostView>[0]) => ({
  view: buildCostView(sessions),
  daily: buildDailyCost(sessions, NOW),
});

describe("admin panels render", () => {
  it("ADM-10 ADM-10a the cost-per-issue table sits in the Details, scrolls in its own box and the main line sits under it", () => {
    const markup = html(<CostPanel {...costProps(TWO_SESSIONS)} />);
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
        <CostPanel {...costProps([session({ agents: [agent({ issue: 1, tokens: 1 })] })])} />
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

describe("admin charts and Details (ADM-20)", () => {
  const sessions = [
    session({
      session: "2030-01-03-a",
      date: "2030-01-03",
      agents: [
        agent({ model: "haiku", tokens: 10, skills: ["x:one"] }),
        agent({ model: "sonnet", tokens: 20 }),
        agent({ model: "opus", tokens: 90, kind: "ideas", skills: ["x:one", "x:two"] }),
      ],
    }),
  ];

  it("ADM-20 ADM-10a ADM-19 ADM-12 ADM-18 every chart is role=img with an aria-label holding its headline", () => {
    const daily = buildDailyCost(sessions, NOW);
    const cost = html(<CostPanel {...costProps(sessions)} />);
    expect(cost).toContain(`role="img" aria-label="${daily.headline}"`);
    const skills = buildSkills(sessions);
    // Skills: the headline is visible text; each bar is an image with its own label, so the
    // kind names and "No records" stay readable.
    const skillsMarkup = html(<SkillsPanel view={skills} />);
    expect(skillsMarkup).toContain(skills.headline);
    expect(skillsMarkup).toContain('role="img" aria-label="x:one: 1 record"');
    expect(skillsMarkup).not.toMatch(/<div[^>]*role="img"/);
    const progress = buildProgress(
      [{ number: 1, title: "A", state: "closed", labels: ["v1"] }],
      [],
      {},
    );
    expect(html(<ProgressPanel view={progress} />)).toContain(
      `role="img" aria-label="${progressHeadline(progress)}"`,
    );
    const health = buildHealth(
      [
        {
          file: "smoke.yml",
          result: {
            ok: true,
            run: { status: "completed", conclusion: "success", updatedAt: NOW.toISOString() },
          },
        },
      ],
      NOW,
    );
    expect(html(<HealthPanel view={health} />)).toContain(
      'role="img" aria-label="Age just now, limit 36 hours"',
    );
  });

  it("ADM-20 the charts are inline SVG with a viewBox, token colours only, no script and no fixed pixel width", () => {
    const markup = [
      html(<CostPanel {...costProps(sessions)} />),
      html(
        <ProgressPanel
          view={buildProgress([{ number: 1, title: "A", state: "open", labels: ["v1"] }], [], {})}
        />,
      ),
    ].join("\n");
    expect(markup).toContain("<svg");
    expect(markup).toContain('viewBox="0 0 140 100"');
    expect(markup).toContain("fill-chart-1");
    expect(markup).toContain("fill-chart-2");
    expect(markup).toContain("fill-chart-3");
    expect(markup).not.toMatch(/#[0-9a-f]{3,6}\b|rgb\(|oklch\(/i);
    expect(markup).not.toContain("<script");
    // Cards and charts take their width from their box: no `width="NNN"` on an svg, no w-[NNpx].
    expect(markup).not.toMatch(/<svg(?![^>]*lucide)[^>]*\swidth="\d+"/); // icons are sized by class
    expect(markup).not.toMatch(/w-\[\d+px\]/);
  });

  it("ADM-20 a Details block is a native details with a summary at least 44 px high, closed by default", () => {
    const markup = html(<CostPanel {...costProps(sessions)} />);
    expect(markup).toMatch(/<details class="[^"]*">/);
    expect(markup).not.toMatch(/<details[^>]*\sopen/);
    expect(markup).toMatch(/<summary class="[^"]*\bmin-h-11\b[^"]*"/); // min-h-11 = 2.75rem = 44 px
    expect(markup).toContain("focus-visible:outline-2");
    expect(markup).toContain("Details: tokens per day");
    expect(markup).toContain("overflow-x-auto");
  });

  it("ADM-10a empty and error states", () => {
    expect(html(<CostPanel {...costProps([])} />)).toContain(
      "No agent records in the last 14 days.",
    );
    expect(html(<CostPanel unavailableNote="HTTP 500" />)).toContain(
      "Ledger unavailable (HTTP 500)",
    );
    expect(html(<CostPanel {...costProps(sessions)} />)).toContain(
      "Main sessions are not in this chart: they are an estimate and not split by model",
    );
  });

  it("ADM-19 empty and error states, and a kind without records is shown", () => {
    expect(html(<SkillsPanel view={buildSkills([])} />)).toContain("No skills recorded yet.");
    expect(html(<SkillsPanel unavailableNote="HTTP 502" />)).toContain(
      "Ledger unavailable (HTTP 502)",
    );
    const markup = html(<SkillsPanel view={buildSkills(sessions)} />);
    expect(markup).toContain("No records"); // docs, marketing, video, post
    expect(markup).toContain("md:grid-cols-2");
    expect(markup).toContain("Details: skills");
  });

  it("ADM-18 each row has a word and an icon; no run and an unreadable row read as such", () => {
    const health = buildHealth(
      [
        { file: "smoke.yml", result: { ok: true, run: null } },
        { file: "health.yml", result: { ok: false, httpStatus: 403 } },
      ],
      NOW,
    );
    const markup = html(<HealthPanel view={health} />).replaceAll("<!-- -->", "");
    expect(markup).toContain("No run yet");
    expect(markup).toContain("Unknown (HTTP 403)");
    expect(markup).toContain("lucide-triangle-alert");
    expect(markup).toContain("Runs when a migration is merged");
    expect(markup).toContain("Details: checks");
    expect(html(<HealthPanel unavailableNote="HTTP 500" />)).toContain(
      "GitHub unavailable (HTTP 500)",
    );
  });
});
