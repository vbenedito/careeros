/**
 * Markdown link check (#155, TEST/ENV-08): every relative link and in-file or cross-file anchor in
 * the documentation must resolve. No network: http(s) links are skipped.
 *   pnpm check:links
 * Scope: README.md, AGENTS.md, SECURITY.md and every *.md under docs/ and specs/.
 * docs/history is frozen (AGENTS.md §2): its files must exist, its anchors are not verified.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { checkDocument, headingAnchors, isFile } from "./links-lib.ts";

const root = resolve(import.meta.dirname, "../..");

function walk(dir: string, out: string[]): void {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".md")) out.push(p);
  }
}

const files: string[] = [];
for (const top of ["README.md", "AGENTS.md", "SECURITY.md"]) {
  const p = join(root, top);
  if (isFile(p)) files.push(p);
}
for (const dir of ["docs", "specs"]) walk(join(root, dir), files);

const anchorCache = new Map<string, Set<string> | undefined>();
function anchorsOf(p: string): Set<string> | undefined {
  if (!anchorCache.has(p)) {
    anchorCache.set(p, isFile(p) ? headingAnchors(readFileSync(p, "utf8")) : undefined);
  }
  return anchorCache.get(p);
}

const problems = files.flatMap((file) =>
  checkDocument({
    file,
    markdown: readFileSync(file, "utf8"),
    anchorsOf,
    skipAnchorsUnder: [join(root, "docs/history")],
  }),
);

if (problems.length > 0) {
  for (const p of problems) {
    console.error(`${relative(root, p.file)}:${p.line}: ${p.target} (${p.reason})`);
  }
  console.error(`\n${problems.length} broken link(s) in ${files.length} Markdown files.`);
  process.exit(1);
}
console.warn(`Checked links in ${files.length} Markdown files: all resolve.`);
