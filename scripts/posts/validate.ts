/**
 * PST-09: check post record files without network or ffprobe (the asset checks stay with the
 * ops-repo workflow). Exit code 1 when any record fails.
 *   node scripts/posts/validate.ts --slugs existing-slugs.json posts/2030/2030-01-01-a-b.json
 */
import { readFileSync } from "node:fs";
import { checkFile, formatResults, parseArgs, parseSlugs } from "./validate-lib.ts";

try {
  const args = parseArgs(process.argv.slice(2));
  const existingSlugs = parseSlugs(readFileSync(args.slugsFile, "utf8"));
  const results = args.files.map((file) =>
    checkFile(file, readFileSync(file, "utf8"), {
      existingSlugs,
      now: args.now ?? new Date(),
      checkPast: !args.skipPast,
    }),
  );
  process.stdout.write(`${formatResults(results)}\n`);
  process.exit(results.some((result) => result.failures.length > 0) ? 1 : 0);
} catch (error) {
  console.error(error instanceof Error ? error.message : "validate failed");
  process.exit(2);
}
