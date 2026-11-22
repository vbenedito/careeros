import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * ADM-15: the one static diagram, written by hand. Each edge names what crosses it. No diagram
 * library and no live status (A6): when the process changes, edit this list.
 */
export interface DiagramEdge {
  from: string;
  to: string;
  /** What crosses the edge. */
  label: string;
}

export const DIAGRAM_EDGES: readonly DiagramEdge[] = [
  { from: "Product owner", to: "Main session", label: "requests, decisions, approvals" },
  {
    from: "Main session",
    to: "Sub-agents (haiku, sonnet, opus)",
    label: "task prompts with the facts; token reports back",
  },
  {
    from: "Sub-agents (haiku, sonnet, opus)",
    to: "GitHub",
    label: "git: branches and commits; REST: issues, pull requests, comments",
  },
  { from: "Main session", to: "GitHub", label: "REST: reviews and merges; git: the ledger file" },
  { from: "GitHub", to: "CI", label: "pull request and push events; checks report back" },
  { from: "CI", to: "Vercel", label: "merged main: the web app is built and deployed" },
  {
    from: "GitHub",
    to: "Supabase",
    label: "migrate.yml: new migrations from main, after a backup",
  },
  {
    from: "Product owner",
    to: "Chrome Web Store",
    label: "the store zip of the extension, uploaded by hand",
  },
  { from: "Main session", to: "Connectors", label: "tool calls and their results" },
];

function Node({ children }: { children: string }) {
  return (
    <span className="rounded-md border border-border bg-muted px-2 py-1 text-sm font-medium text-foreground">
      {children}
    </span>
  );
}

/** ADM-15: how the parts connect. */
export function DiagramPanel() {
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle variant="section">How it connects</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="flex flex-col gap-3">
          {DIAGRAM_EDGES.map((e) => (
            <li
              key={`${e.from}>${e.to}>${e.label}`}
              className="flex flex-col items-start gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2"
            >
              <Node>{e.from}</Node>
              <span className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
                <span aria-hidden="true" className="sm:hidden">
                  ↓{" "}
                </span>
                <span className="sr-only">to, carrying </span>
                {e.label}
                <span aria-hidden="true" className="hidden sm:inline">
                  {" "}
                  →
                </span>
              </span>
              <Node>{e.to}</Node>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
