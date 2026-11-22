/**
 * PST-09: pure parts of `scripts/posts/validate.ts` (argument parsing, one file's check, output).
 * No file system and no network here.
 */
import {
  type PostFailure,
  type ValidateRecordContext,
  validateRecord,
} from "../../packages/shared/src/posts.ts";

export interface CliArgs {
  slugsFile: string;
  files: string[];
  now: Date | null;
  skipPast: boolean;
}

/** `--slugs <file.json> [--now <ISO>] [--skip-past] <record.json>...`; throws on a bad call. */
export function parseArgs(argv: readonly string[]): CliArgs {
  let slugsFile: string | null = null;
  let now: Date | null = null;
  let skipPast = false;
  const files: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    if (arg === "--slugs" || arg === "--now") {
      const value = argv[++i];
      if (value === undefined) throw new Error(`${arg} needs a value`);
      if (arg === "--slugs") slugsFile = value;
      else {
        now = new Date(value);
        if (Number.isNaN(now.getTime())) throw new Error("--now must be an ISO 8601 date-time");
      }
    } else if (arg === "--skip-past") skipPast = true;
    else if (arg.startsWith("--")) throw new Error(`unknown option ${arg}`);
    else files.push(arg);
  }
  if (slugsFile === null) throw new Error("--slugs <file.json> is required");
  if (files.length === 0) throw new Error("give at least one record file");
  return { slugsFile, files, now, skipPast };
}

/** The slugs file is a JSON array of strings. */
export function parseSlugs(json: string): string[] {
  const data: unknown = JSON.parse(json);
  if (!Array.isArray(data) || !data.every((item) => typeof item === "string")) {
    throw new Error("the slugs file must be a JSON array of strings");
  }
  return data;
}

export interface FileResult {
  path: string;
  failures: PostFailure[];
}

export function checkFile(
  path: string,
  text: string,
  context: Omit<ValidateRecordContext, "path">,
): FileResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { path, failures: [{ code: "schema", message: "file is not valid JSON" }] };
  }
  return { path, failures: validateRecord(data, { ...context, path }) };
}

export function formatResults(results: readonly FileResult[]): string {
  const lines: string[] = [];
  for (const { path, failures } of results) {
    lines.push(`${failures.length === 0 ? "OK  " : "FAIL"} ${path}`);
    for (const failure of failures) {
      const where = failure.platform ? ` (${failure.platform})` : "";
      lines.push(`  - [${failure.code}]${where} ${failure.message}`);
    }
  }
  const failed = results.filter((result) => result.failures.length > 0).length;
  lines.push(
    failed === 0
      ? `${results.length} record(s) valid`
      : `${failed} of ${results.length} record(s) failed`,
  );
  return lines.join("\n");
}
