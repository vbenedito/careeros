/**
 * pnpm check:spec-trace — spec-ID traceability (#157, TEST-02).
 *
 * 1. Requirement IDs DEFINED in `specs/**` are the bold `**ID**` markers (TRK-05, AUTH-10a,
 *    EXT-UI-05c, ...).
 * 2. IDs REFERENCED are the ones in test titles: the first string of it()/test()/describe(), and
 *    the quoted descriptions of pgTAP assertions in `supabase/tests/**`.
 * 3. FAILS when a test references an ID no spec defines (a typo or a renamed requirement).
 * 4. Reports defined IDs without a test as a warning. `specs/untested-ids.json` lists the IDs that
 *    are not testable by design, with a reason; the check fails when a listed ID has gained a test
 *    or no longer exists, so the list stays honest.
 * 5. In CI the counts go to $GITHUB_STEP_SUMMARY.
 */
import { appendFileSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

/** A requirement ID: prefix (one or more upper-case parts), number, optional lower-case suffix. */
const ID_SOURCE = String.raw`[A-Z]+(?:-[A-Z]+)*-\d{2}[a-z]?`;

/** IDs defined in a spec: the bold markers `**ID**`. */
export function extractDefinedIds(markdown: string): string[] {
  const ids = new Set<string>();
  for (const match of markdown.matchAll(new RegExp(String.raw`\*\*(${ID_SOURCE})\*\*`, "g"))) {
    ids.add(match[1] as string);
  }
  return [...ids];
}

/** The prefixes (TRK, EXT-UI, ...) of the defined IDs. */
export function prefixesOf(ids: Iterable<string>): Set<string> {
  return new Set([...ids].map((id) => id.replace(/-\d{2}[a-z]?$/, "")));
}

/**
 * Every requirement-like ID mentioned in a text, with a known prefix (so "GMT-14" or "UTF-8" in a
 * test title are not mistaken for requirements). A number with one digit or with an upper-case
 * suffix (TRK-5, TRK-05A) is returned too, so that it is reported as unknown.
 */
export function findIds(text: string, prefixes: ReadonlySet<string>): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(/\b([A-Z]+(?:-[A-Z]+)*)-(\d+[A-Za-z]?)(?![\w-])/g)) {
    if (prefixes.has(match[1] as string)) found.add(`${match[1]}-${match[2]}`);
  }
  return [...found];
}

/**
 * Titles of the vitest tests in a file: the first string literal of `it(`, `test(`, `describe(`
 * (also `.each(...)(`, `.skip(`, `.only(`, `.concurrent(`), on the same or the next line.
 */
export function extractTestTitles(source: string): string[] {
  const titles: string[] = [];
  const call =
    /\b(?:it|test|describe)(?:\.\w+)*\s*(?:\([^()]*(?:\([^()]*\)[^()]*)*\)\s*)?\(\s*(["'`])/g;
  for (const match of source.matchAll(call)) {
    const quote = match[1] as string;
    let end = (match.index ?? 0) + match[0].length;
    let title = "";
    while (end < source.length && source[end] !== quote) {
      if (source[end] === "\\") end++;
      title += source[end] ?? "";
      end++;
    }
    titles.push(title);
  }
  return titles;
}

/** Descriptions in a pgTAP file: single-quoted strings (SQL comments are ignored). */
export function extractSqlDescriptions(source: string): string[] {
  const withoutComments = source
    .split("\n")
    .map((line) => line.replace(/^\s*--.*$/, ""))
    .join("\n");
  const strings: string[] = [];
  for (const match of withoutComments.matchAll(/'((?:[^']|'')*)'/g)) {
    strings.push((match[1] as string).replaceAll("''", "'"));
  }
  return strings;
}

export type Allowlist = Record<string, string>;

export interface TraceInput {
  defined: ReadonlySet<string>;
  /** ID -> files that reference it in a test title. */
  referenced: ReadonlyMap<string, readonly string[]>;
  allowlist: Allowlist;
}

export interface TraceResult {
  /** Referenced by tests, defined nowhere. Fails the check. */
  unknown: { id: string; files: readonly string[] }[];
  /** Allow-listed but now tested. Fails the check. */
  allowlistedButTested: string[];
  /** Allow-listed but not defined in any spec. Fails the check. */
  allowlistedUnknown: string[];
  /** Allow-list entries without a reason. Fails the check. */
  allowlistWithoutReason: string[];
  tested: string[];
  allowlisted: string[];
  /** Defined, not tested, not allow-listed. A warning. */
  untested: string[];
}

const byId = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true });

export function trace({ defined, referenced, allowlist }: TraceInput): TraceResult {
  const unknown = [...referenced]
    .filter(([id]) => !defined.has(id))
    .map(([id, files]) => ({ id, files }))
    .sort((a, b) => byId(a.id, b.id));
  const listed = Object.keys(allowlist).sort(byId);
  const tested = [...defined].filter((id) => referenced.has(id)).sort(byId);
  return {
    unknown,
    allowlistedButTested: listed.filter((id) => referenced.has(id)),
    allowlistedUnknown: listed.filter((id) => !defined.has(id)),
    allowlistWithoutReason: listed.filter((id) => !allowlist[id]?.trim()),
    tested,
    allowlisted: listed.filter((id) => defined.has(id) && !referenced.has(id)),
    untested: [...defined].filter((id) => !referenced.has(id) && !(id in allowlist)).sort(byId),
  };
}

export function hasFailures(r: TraceResult): boolean {
  return (
    r.unknown.length > 0 ||
    r.allowlistedButTested.length > 0 ||
    r.allowlistedUnknown.length > 0 ||
    r.allowlistWithoutReason.length > 0
  );
}

export function renderSummary(r: TraceResult, defined: number): string {
  const lines = [
    "## Spec traceability (TEST-02)",
    "",
    "| Defined | Tested | Allow-listed | Untested (warning) |",
    "|---:|---:|---:|---:|",
    `| ${defined} | ${r.tested.length} | ${r.allowlisted.length} | ${r.untested.length} |`,
  ];
  if (r.untested.length > 0) lines.push("", `Untested: ${r.untested.join(", ")}`);
  const failures = failureLines(r);
  if (failures.length > 0) lines.push("", "**Failures**", "", ...failures.map((l) => `- ${l}`));
  return `${lines.join("\n")}\n`;
}

export function failureLines(r: TraceResult): string[] {
  return [
    ...r.unknown.map(
      ({ id, files }) =>
        `${id} is referenced by tests (${files.join(", ")}) but defined in no spec`,
    ),
    ...r.allowlistedButTested.map(
      (id) => `${id} is in specs/untested-ids.json but now has a test: remove it from the list`,
    ),
    ...r.allowlistedUnknown.map(
      (id) => `${id} is in specs/untested-ids.json but defined in no spec: remove it from the list`,
    ),
    ...r.allowlistWithoutReason.map((id) => `${id} in specs/untested-ids.json has no reason`),
  ];
}

function walk(dir: string, accept: (path: string) => boolean, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".") || name === "dist") continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, accept, out);
    else if (accept(path)) out.push(path);
  }
  return out;
}

function main(): number {
  const root = resolve(import.meta.dirname, "../..");
  const rel = (p: string) => relative(root, p);

  const defined = new Set<string>();
  for (const file of walk(join(root, "specs"), (p) => p.endsWith(".md"))) {
    for (const id of extractDefinedIds(readFileSync(file, "utf8"))) defined.add(id);
  }

  const prefixes = prefixesOf(defined);
  const referenced = new Map<string, string[]>();
  const add = (titles: string[], file: string) => {
    for (const id of titles.flatMap((t) => findIds(t, prefixes))) {
      const files = referenced.get(id) ?? [];
      if (!files.includes(file)) files.push(file);
      referenced.set(id, files);
    }
  };
  const isTs = (p: string) => /\.test\.tsx?$/.test(p);
  for (const dir of ["apps", "packages", "scripts"]) {
    for (const file of walk(join(root, dir), isTs)) {
      add(extractTestTitles(readFileSync(file, "utf8")), rel(file));
    }
  }
  for (const file of walk(join(root, "supabase/tests"), (p) => p.endsWith(".sql"))) {
    add(extractSqlDescriptions(readFileSync(file, "utf8")), rel(file));
  }

  const allowlist = JSON.parse(readFileSync(join(root, "specs/untested-ids.json"), "utf8"));
  const result = trace({ defined, referenced, allowlist });

  /* biome-ignore lint/suspicious/noConsole: CLI output */
  const log = (line: string) => console.log(line);
  log(
    `spec-trace: ${defined.size} defined, ${result.tested.length} tested, ` +
      `${result.allowlisted.length} allow-listed, ${result.untested.length} untested`,
  );
  if (result.untested.length > 0) log(`warning: no test for ${result.untested.join(", ")}`);
  for (const line of failureLines(result)) log(`error: ${line}`);

  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, renderSummary(result, defined.size));
  }
  return hasFailures(result) ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  process.exitCode = main();
}
