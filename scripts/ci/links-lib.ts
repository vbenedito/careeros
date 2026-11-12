/**
 * Markdown link checking (#155): pure helpers, tested in links-lib.test.ts.
 * Only relative links and anchors are checked; http(s), mailto and other schemes are skipped.
 */
import { existsSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";

/** GitHub-style heading slug: lower case, no punctuation, spaces to hyphens. */
export function slugify(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, "")
    .replace(/\s/g, "-");
}

/** Removes fenced code blocks (``` or ~~~) so their content is neither a heading nor a link. */
function stripFences(markdown: string): string {
  const out: string[] = [];
  let fence: string | null = null;
  for (const line of markdown.split("\n")) {
    const m = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (fence === null) {
      if (m?.[1]) {
        fence = m[1][0] ?? null;
        out.push("");
        continue;
      }
      out.push(line);
    } else {
      if (m?.[1]?.[0] === fence) fence = null;
      out.push("");
    }
  }
  return out.join("\n");
}

/** Plain text of a heading as GitHub renders it (links, emphasis and code markers dropped). */
function headingText(raw: string): string {
  return raw
    .replace(/\s+#+\s*$/, "")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/[*`]/g, "")
    .replace(/(^|[^\p{L}\p{N}])_+|_+($|[^\p{L}\p{N}])/gu, "$1$2");
}

/** Anchors a document defines: one per heading, repeated slugs get -1, -2, … like GitHub. */
export function headingAnchors(markdown: string): Set<string> {
  const anchors = new Set<string>();
  const seen = new Map<string, number>();
  const add = (raw: string) => {
    const base = slugify(headingText(raw));
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    anchors.add(n === 0 ? base : `${base}-${n}`);
  };
  const lines = stripFences(markdown).split("\n");
  lines.forEach((line, i) => {
    const m = /^ {0,3}#{1,6}\s+(.*)$/.exec(line);
    if (m?.[1]) {
      add(m[1]);
      return;
    }
    // Setext heading: a paragraph line underlined with === or ---.
    if (/^ {0,3}(=+|-+)\s*$/.test(line) && i > 0) {
      const prev = lines[i - 1] ?? "";
      if (/^ {0,3}[^\s#>|*+-]/.test(prev) && !/^ {0,3}\d+[.)]\s/.test(prev)) add(prev.trim());
    }
  });
  // Explicit HTML anchors.
  for (const m of markdown.matchAll(/<a\s+(?:name|id)="([^"]+)"/g)) if (m[1]) anchors.add(m[1]);
  return anchors;
}

export interface FoundLink {
  target: string;
  line: number;
}

/** Inline links and images `[text](target)` and reference definitions `[id]: target`. */
export function extractLinks(markdown: string): FoundLink[] {
  const links: FoundLink[] = [];
  const lines = stripFences(markdown).split("\n");
  lines.forEach((rawLine, i) => {
    const line = rawLine.replace(/`[^`]*`/g, (s) => " ".repeat(s.length));
    for (const m of line.matchAll(/\]\(\s*(<[^>]*>|[^)\s]*)(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g)) {
      const t = (m[1] ?? "").replace(/^<|>$/g, "");
      if (t) links.push({ target: t, line: i + 1 });
    }
    const def = /^ {0,3}\[[^\]]+\]:\s*(<[^>]*>|\S+)/.exec(line);
    if (def?.[1]) links.push({ target: def[1].replace(/^<|>$/g, ""), line: i + 1 });
  });
  return links;
}

/** True for links this check does not resolve (any URI scheme, protocol-relative). */
export function isExternal(target: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("//");
}

export interface LinkProblem {
  file: string;
  line: number;
  target: string;
  reason: string;
}

export interface DocReader {
  /** Markdown content of an absolute path, or undefined if it is not a readable file. */
  read(absPath: string): string | undefined;
}

/**
 * Checks every relative link of one document. `anchorsOf` is called with the absolute path of a
 * Markdown file whose anchors are needed (cached by the caller).
 */
export function checkDocument(opts: {
  file: string;
  markdown: string;
  anchorsOf: (absPath: string) => Set<string> | undefined;
  /** Absolute paths below which anchors are not verified (docs/history), files still must exist. */
  skipAnchorsUnder?: string[];
  exists?: (absPath: string) => boolean;
}): LinkProblem[] {
  const exists = opts.exists ?? ((p: string) => existsSync(p));
  const problems: LinkProblem[] = [];
  for (const { target, line } of extractLinks(opts.markdown)) {
    if (isExternal(target)) continue;
    const hashAt = target.indexOf("#");
    const pathPart = hashAt === -1 ? target : target.slice(0, hashAt);
    let anchor = hashAt === -1 ? "" : target.slice(hashAt + 1);
    try {
      anchor = decodeURIComponent(anchor);
    } catch {
      // keep the raw anchor
    }
    let dest = opts.file;
    if (pathPart) {
      let decoded = pathPart.replace(/\?.*$/, "");
      try {
        decoded = decodeURIComponent(decoded);
      } catch {
        // keep raw
      }
      dest = resolve(dirname(opts.file), decoded);
      if (!exists(dest)) {
        problems.push({ file: opts.file, line, target, reason: "file does not exist" });
        continue;
      }
    }
    if (!anchor) continue;
    if (!dest.endsWith(".md")) continue; // anchors in code files (e.g. #L10) are not checked
    if (opts.skipAnchorsUnder?.some((p) => dest === p || dest.startsWith(`${p}/`))) continue;
    const anchors = opts.anchorsOf(dest);
    if (!anchors) continue; // a directory
    if (!anchors.has(anchor.toLowerCase()) && !anchors.has(anchor)) {
      problems.push({ file: opts.file, line, target, reason: `no heading for #${anchor}` });
    }
  }
  return problems;
}

export function isFile(p: string): boolean {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

/**
 * Guard against a check that passes because it scanned nothing (moved folder, wrong cwd):
 * the root documents and at least one file under docs/ and specs/ must be in the scanned set.
 */
export function scopeProblems(root: string, files: string[]): string[] {
  const rel = new Set(files.map((f) => f.slice(root.length + 1)));
  const problems: string[] = [];
  if (files.length === 0) problems.push("no Markdown files were scanned");
  for (const required of ["README.md", "AGENTS.md", "SECURITY.md"]) {
    if (!rel.has(required)) problems.push(`${required} not found`);
  }
  for (const dir of ["docs/", "specs/"]) {
    if (![...rel].some((f) => f.startsWith(dir))) problems.push(`no Markdown files under ${dir}`);
  }
  return problems;
}
