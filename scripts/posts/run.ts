/**
 * Posts pipeline CLI (PST-11, PST-35). Never prints a secret.
 *   node scripts/posts/run.ts publish --ops-dir <path> [--ops-repo owner/name] [--dry-run] [--now <ISO>] [--post-time HH:MM]
 *   node scripts/posts/run.ts auto-merge --ops-repo owner/name [--dry-run] [--now <ISO>] [--post-time HH:MM]
 *   node scripts/posts/run.ts daily --ops-dir <path> --ops-repo owner/name [--dry-run] [--now <ISO>, dry run only] [--post-time HH:MM]
 *   node scripts/posts/run.ts cron-lines --post-time 19:00 [--now <ISO>]
 * Env: GH_TOKEN; publish also IG_USER_ID, IG_ACCESS_TOKEN, YT_CLIENT_ID, YT_CLIENT_SECRET,
 * YT_REFRESH_TOKEN (not needed with --dry-run), POSTS_APPROVER_LOGIN, GITHUB_REPOSITORY;
 * auto-merge also GITHUB_RUN_ID; daily also META_APP_ID, META_APP_SECRET, IG_ACCESS_TOKEN, IG_USER_ID,
 * YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN and the optional OPS_SECRETS_PAT. Exit code 0 on success, 1 on any failure, 2 on a bad call.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { cronLines, POST_DAYS, POST_TIMEZONE } from "../../packages/shared/src/posts.ts";
import { BOT_LOGIN } from "./approval.ts";
import { runAutoMerge } from "./automerge-run.ts";
import { parseCli } from "./cli.ts";
import { runDaily, SCHEDULER_WORKFLOW } from "./daily.ts";
import { GitHubClient } from "./github.ts";
import { InstagramClient } from "./instagram.ts";
import { errorInfo } from "./mask.ts";
import { ffprobeVideo } from "./probe.ts";
import { readRecords } from "./records.ts";
import { runScheduler } from "./scheduler.ts";
import { GitStateStore } from "./state.ts";
import { YoutubeClient } from "./youtube.ts";

const need = (env: Record<string, string | undefined>, name: string): string => {
  const value = env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
};

const out = (line: string): void => {
  process.stdout.write(`${line}\n`);
};

async function main(
  argv: readonly string[],
  env: Record<string, string | undefined>,
): Promise<number> {
  const args = parseCli(argv, env);
  if (args.command === "cron-lines") {
    for (const line of cronLines(args.postTime, POST_TIMEZONE, POST_DAYS, args.now)) out(line);
    return 0;
  }
  const repo = args.opsRepo ?? env.GITHUB_REPOSITORY ?? null;
  if (!repo) throw new Error("--ops-repo owner/name is required");
  const gh = new GitHubClient({ repo, token: need(env, "GH_TOKEN"), fetch: globalThis.fetch });

  if (args.command === "auto-merge") {
    const report = await runAutoMerge({
      gh,
      now: args.now,
      postTime: args.postTime,
      dryRun: args.dryRun,
      runId: args.dryRun ? (env.GITHUB_RUN_ID ?? "0") : need(env, "GITHUB_RUN_ID"),
      out,
    });
    return report.failures > 0 ? 1 : 0;
  }
  if (args.command === "daily") {
    if (!args.opsDir) throw new Error("--ops-dir <path> is required");
    const secret = (name: string): string => (args.dryRun ? "" : need(env, name));
    const workflowText = await readFile(join(args.opsDir, SCHEDULER_WORKFLOW), "utf8").catch(
      () => null,
    );
    const report = await runDaily({
      gh,
      store: new GitStateStore(args.opsDir),
      instagram: new InstagramClient({
        fetch: globalThis.fetch,
        token: secret("IG_ACCESS_TOKEN"),
        userId: args.dryRun ? "0" : need(env, "IG_USER_ID"),
      }),
      youtube: new YoutubeClient({
        fetch: globalThis.fetch,
        clientId: secret("YT_CLIENT_ID"),
        clientSecret: secret("YT_CLIENT_SECRET"),
        refreshToken: secret("YT_REFRESH_TOKEN"),
      }),
      fetch: globalThis.fetch,
      files: await readRecords(args.opsDir),
      workflowText,
      now: args.now,
      postTime: args.postTime,
      secrets: {
        igAccessToken: env.IG_ACCESS_TOKEN,
        metaAppId: env.META_APP_ID,
        metaAppSecret: env.META_APP_SECRET,
        ytClientId: env.YT_CLIENT_ID,
        ytClientSecret: env.YT_CLIENT_SECRET,
        ytRefreshToken: env.YT_REFRESH_TOKEN,
        opsPat: env.OPS_SECRETS_PAT,
      },
      dryRun: args.dryRun,
      out,
    });
    if (args.dryRun) out("dry run: nothing was written or published");
    return report.errors > 0 ? 1 : 0;
  }
  if (args.command === "publish") {
    if (!args.opsDir) throw new Error("--ops-dir <path> is required");
    // A dry run calls no platform endpoint, so it needs no platform secret.
    const secret = (name: string): string => (args.dryRun ? "" : need(env, name));
    const instagram = new InstagramClient({
      fetch: globalThis.fetch,
      token: secret("IG_ACCESS_TOKEN"),
      userId: args.dryRun ? "0" : need(env, "IG_USER_ID"),
    });
    const youtube = new YoutubeClient({
      fetch: globalThis.fetch,
      clientId: secret("YT_CLIENT_ID"),
      clientSecret: secret("YT_CLIENT_SECRET"),
      refreshToken: secret("YT_REFRESH_TOKEN"),
    });
    const report = await runScheduler({
      gh,
      store: new GitStateStore(args.opsDir),
      instagram,
      youtube,
      probe: ffprobeVideo,
      files: await readRecords(args.opsDir),
      now: args.now,
      postTime: args.postTime,
      approverLogin: env.POSTS_APPROVER_LOGIN || BOT_LOGIN,
      clock: args.nowGiven ? () => args.now : () => new Date(),
      dryRun: args.dryRun,
      out,
    });
    if (args.dryRun) out("dry run: nothing was written or published");
    return report.failures > 0 || report.errors > 0 ? 1 : 0;
  }
  throw new Error("usage: run.ts publish|auto-merge|daily|cron-lines (see the file header)");
}

try {
  process.exitCode = await main(process.argv.slice(2), process.env);
} catch (error) {
  // Only the HTTP status and code of an API error, or the plain message of a usage error.
  const info = errorInfo(error);
  const known = error instanceof Error && !("http_status" in error);
  console.error(
    known
      ? error.message
      : `failed (http_status=${info.http_status ?? "none"}, code=${info.code ?? "none"})`,
  );
  process.exitCode =
    error instanceof Error &&
    /required|not set|must be|unknown option|needs a value|usage/.test(error.message)
      ? 2
      : 1;
}
