/**
 * ADM-13 (a): the fixed map of what Claude reads, kept in code next to the page. It lists repo
 * paths and skill names only (ADM-07). Edit it when the rules in AGENTS.md or
 * docs/process/agents.md change.
 */
export interface DocsGroup {
  title: string;
  /** Short note on when the group applies. */
  when: string;
  items: string[];
}

export const DOCS_MAP: readonly DocsGroup[] = [
  {
    title: "Always loaded",
    when: "Every session, every kind of task",
    items: ["AGENTS.md", "The handoff", "Memory"],
  },
  {
    title: "Code",
    when: "Building or reviewing an issue",
    items: ["The spec and ADRs the issue names", "docs/process/agents.md"],
  },
  {
    title: "Marketing",
    when: "Brand, copy and social work",
    items: ["docs/marketing/", "The matching marketing skills"],
  },
  {
    title: "Video",
    when: "Video scripts and formats",
    items: ["docs/marketing/video-formats.md"],
  },
];
