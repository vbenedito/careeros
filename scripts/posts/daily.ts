/**
 * PST-23 (T18, PST-12, PST-19, PST-33, PST-11): the daily job. Every step is idempotent and skips
 * safely when it is already done: alerts go through `ensureIssue` (one issue per title; "once"
 * steps also see closed issues) and state changes are written only when something changed.
 * A step that throws is logged with the HTTP status and code only and counted; the other steps
 * still run. With `dryRun` it reads GitHub, prints the plan and writes and calls nothing else.
 */
import {
  cronLines,
  effectiveStatus,
  IG_TOKEN_WARN_DAYS,
  OPS_PAT_WARN_DAYS,
  POST_DAYS,
  POST_TIMEZONE,
  type PostPlatform,
  type PostRecord,
  PostRecordSchema,
  type PostState,
  type PostTokens,
  recordStem,
  slotState,
} from "../../packages/shared/src/posts.ts";
import { runAutoMerge } from "./automerge-run.ts";
import type { GitHubApi } from "./github.ts";
import type { InstagramApi } from "./instagram.ts";
import { alertBody, type EnsureIssue, ensureIssue, issueTitle, upsertIssue } from "./issues.ts";
import { errorInfo, type FetchLike, mask, type Out } from "./mask.ts";
import { AUTOMATIC_PLATFORMS, blank, type RecordFile } from "./scheduler.ts";
import { emptyState, StatePushError, type StateStore } from "./state.ts";
import {
  checkInstagramToken,
  checkOpsPat,
  checkYoutubeToken,
  type TokenVerdict,
} from "./tokens.ts";
import type { YoutubeApi } from "./youtube.ts";

export const WORKFLOWS_DIR = ".github/workflows/";
export const SCHEDULER_WORKFLOW = ".github/workflows/posts-publish.yml";
/** The ops workflows whose cancelled runs alert (PST-11). */
export const WATCHED_WORKFLOWS = [
  "posts-publish.yml",
  "posts-auto-merge.yml",
  "posts-daily.yml",
] as const;
/** Commits of the last days are checked for direct pushes under `.github/workflows/` (PST-33). */
export const TRUST_LOOKBACK_DAYS = 2;
/** A cancelled run older than this is not reconciled any more. */
export const CANCELLED_LOOKBACK_DAYS = 7;
const DAY_MS = 86_400_000;

export interface DailySecrets {
  igAccessToken?: string | undefined;
  metaAppId?: string | undefined;
  metaAppSecret?: string | undefined;
  ytClientId?: string | undefined;
  ytClientSecret?: string | undefined;
  ytRefreshToken?: string | undefined;
  opsPat?: string | undefined;
}

export interface DailyDeps {
  gh: GitHubApi;
  store: StateStore;
  instagram: InstagramApi;
  youtube: YoutubeApi;
  /** Plain fetch for the token checks (stubbed in tests). */
  fetch: FetchLike;
  files: readonly RecordFile[];
  /** Text of `.github/workflows/posts-publish.yml` in the ops checkout, or null. */
  workflowText: string | null;
  now: Date;
  postTime: string;
  secrets: DailySecrets;
  dryRun: boolean;
  out: Out;
}

export interface DailyReport {
  lines: string[];
  /** Issues opened by this run. */
  opened: number;
  /** Steps or checks that threw or could not give a verdict. */
  errors: number;
}

/** `YYYY-MM-DD` of an instant on the wall clock of `timeZone`. */
export function localDate(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/** Cron lines of a workflow file: the value of every `- cron: "..."` entry. */
export function extractCronLines(yaml: string): string[] {
  const lines: string[] = [];
  for (const line of yaml.split(/\r?\n/)) {
    const m = /^\s*-?\s*cron:\s*["']?([^"'#]+?)["']?\s*(?:#.*)?$/.exec(line);
    if (m) lines.push((m[1] as string).trim().replace(/\s+/g, " "));
  }
  return lines;
}

type StateEntry = NonNullable<PostState["platforms"][PostPlatform]>;

interface Rec {
  file: RecordFile;
  record: PostRecord;
  stem: string;
}

export async function runDaily(deps: DailyDeps): Promise<DailyReport> {
  const report: DailyReport = { lines: [], opened: 0, errors: 0 };
  const say = (line: string): void => {
    report.lines.push(line);
    deps.out(line);
  };
  const d = deps;

  const records: Rec[] = [];
  for (const file of [...d.files].sort((a, b) => a.path.localeCompare(b.path))) {
    let data: unknown = null;
    try {
      data = JSON.parse(file.text);
    } catch {
      // reported below
    }
    const parsed = PostRecordSchema.safeParse(data);
    if (!parsed.success) {
      say(`invalid record file ${file.path}`);
      continue;
    }
    records.push({ file, record: parsed.data, stem: recordStem(parsed.data) });
  }

  /** Opens or finds one issue; counts the new ones. In a dry run nothing is written. */
  const raise = async (what: string, input: EnsureIssue): Promise<void> => {
    say(`${what}: ${d.dryRun ? "would open" : "alert"} "${input.title}"`);
    if (d.dryRun) return;
    const result = await ensureIssue(d.gh, input);
    if (result.created) report.opened++;
  };

  const steps: [string, () => Promise<void>][] = [
    ["tokens", () => tokenChecks(d, report, say, raise)],
    ["no-publish", () => noPublish(d, records, raise)],
    ["missed-slots", () => missedSlots(d, records, say)],
    ["cron-coverage", () => cronCoverage(d, say)],
    ["trust", () => trustChecks(d, say, raise)],
    ["cancelled-runs", () => cancelledRuns(d, say, raise)],
    ["verification", () => verification(d, records, say, raise)],
    ["unmerged-records", () => unmerged(d, say)],
  ];
  for (const [name, run] of steps) {
    try {
      await run();
    } catch (error) {
      if (error instanceof StatePushError) {
        say(`${name}: state push failed, run stopped`);
        throw error;
      }
      const info = errorInfo(error);
      say(
        `${name}: error (http_status=${info.http_status ?? "none"}, code=${info.code ?? "none"})`,
      );
      report.errors++;
    }
  }
  return report;
}

type Raise = (what: string, input: EnsureIssue) => Promise<void>;
type Say = (line: string) => void;

const lines = (...parts: (string | null)[]): string => parts.filter((p) => p !== null).join("\n");

// --- a. token checks (PST-22.1, PST-22, PST-23) ----------------------------------------------

async function tokenChecks(
  d: DailyDeps,
  report: DailyReport,
  say: Say,
  raise: Raise,
): Promise<void> {
  if (d.dryRun) {
    say("tokens: dry run, the platforms are not called");
    return;
  }
  const s = d.secrets;
  const previous = await d.store.readTokens();
  const tokens: PostTokens = {
    schema: 1,
    checked_on: d.now.toISOString().slice(0, 10),
    ...(previous?.instagram ? { instagram: previous.instagram } : {}),
    ...(previous?.youtube ? { youtube: previous.youtube } : {}),
    ...(previous?.ops_pat ? { ops_pat: previous.ops_pat } : {}),
  };
  const alertFor = (
    stem: string,
    platform: PostPlatform | "all",
    title: string,
    v: TokenVerdict,
    next: string,
  ) =>
    raise("tokens", {
      title: issueTitle("token-expiry", stem, platform),
      labels: ["token-expiry"],
      body: lines(`Token: ${title}`, ...v.problems.map((p) => `- ${p}`), `Next step: ${next}`),
    });

  // Instagram
  if (s.igAccessToken && s.metaAppId && s.metaAppSecret) {
    const v = await checkInstagramToken({
      fetch: d.fetch,
      accessToken: s.igAccessToken,
      appId: s.metaAppId,
      appSecret: s.metaAppSecret,
      now: d.now,
      warnDays: IG_TOKEN_WARN_DAYS,
      out: d.out,
    });
    if (v.unknown) {
      say("tokens: the Instagram token could not be checked now");
      report.errors++;
    } else {
      tokens.instagram = { ok: v.problems.length === 0, expires_on: v.expiresOn };
      say(`tokens: Instagram ${v.problems.length === 0 ? "ok" : "needs attention"}`);
      if (v.problems.length > 0) {
        await alertFor(
          "tokens",
          "instagram",
          "Instagram (IG_ACCESS_TOKEN)",
          v,
          "Make a new system-user token with only instagram_basic and instagram_content_publish in Meta Business settings, then replace the secret IG_ACCESS_TOKEN.",
        );
      }
    }
  } else {
    say(
      "tokens: Instagram check skipped, IG_ACCESS_TOKEN, META_APP_ID or META_APP_SECRET is not set",
    );
    report.errors++;
  }

  // YouTube
  if (s.ytClientId && s.ytClientSecret && s.ytRefreshToken) {
    const v = await checkYoutubeToken({
      fetch: d.fetch,
      clientId: s.ytClientId,
      clientSecret: s.ytClientSecret,
      refreshToken: s.ytRefreshToken,
      out: d.out,
    });
    if (v.unknown) {
      say("tokens: the YouTube token could not be checked now");
      report.errors++;
    } else {
      tokens.youtube = { ok: v.problems.length === 0 };
      say(`tokens: YouTube ${v.problems.length === 0 ? "ok" : "needs attention"}`);
      if (v.problems.length > 0) {
        await alertFor(
          "tokens",
          "youtube",
          "YouTube (YT_REFRESH_TOKEN)",
          v,
          'Make a new refresh token by hand: open the Google OAuth Playground, tick "Use your own OAuth credentials" and enter YT_CLIENT_ID and YT_CLIENT_SECRET, select the scopes youtube.upload and youtube.readonly, authorize with the consent prompt, exchange the code, then replace the secret YT_REFRESH_TOKEN.',
        );
      }
    }
  } else {
    say(
      "tokens: YouTube check skipped, YT_CLIENT_ID, YT_CLIENT_SECRET or YT_REFRESH_TOKEN is not set",
    );
    report.errors++;
  }

  // The secret-writing PAT
  if (s.opsPat) {
    const v = await checkOpsPat({
      fetch: d.fetch,
      token: s.opsPat,
      repo: d.gh.repo,
      now: d.now,
      warnDays: OPS_PAT_WARN_DAYS,
      out: d.out,
    });
    if (v.unknown) {
      say("tokens: OPS_SECRETS_PAT could not be checked now");
      report.errors++;
    } else {
      tokens.ops_pat = { expires_on: v.expiresOn };
      say(`tokens: OPS_SECRETS_PAT ${v.problems.length === 0 ? "ok" : "needs attention"}`);
      if (v.problems.length > 0) {
        await alertFor(
          "ops-secrets-pat",
          "all",
          "OPS_SECRETS_PAT",
          v,
          "Make a new fine-grained token with Secrets read and write on the ops repository only, then replace the secret OPS_SECRETS_PAT.",
        );
      }
    }
  } else {
    say("tokens: OPS_SECRETS_PAT is not set, its expiry check is skipped");
  }

  await d.store.writeTokens(tokens);
  await d.store.commitAndPush("chore(posts-state): token expiry dates");
}

// --- c. no publish on a post day (T18) ---------------------------------------------------------

const DONE = new Set(["published", "skipped", "failed"]);

async function noPublish(d: DailyDeps, records: Rec[], raise: Raise): Promise<void> {
  for (const { record, stem } of records) {
    const today = localDate(d.now, record.timezone);
    const yesterday = localDate(new Date(d.now.getTime() - DAY_MS), record.timezone);
    if (record.date !== today && record.date !== yesterday) continue;
    if (slotState(record, d.now) !== "missed") continue;
    if (record.ai_label) continue; // reminder mode: nothing is automatic
    const automatic = AUTOMATIC_PLATFORMS.filter((p) => record.platforms[p]?.status === "ready");
    if (automatic.length === 0) continue;
    const state = (await d.store.read(stem)) ?? emptyState();
    if (Object.values(state.platforms).some((p) => p && DONE.has(p.status))) continue;
    await raise(stem, {
      title: `${stem}: nothing was published for this post day`,
      labels: ["post-alert"],
      once: true,
      body: alertBody({
        record,
        platform: "all",
        what: "The post day is here, the window ended, and no platform has a published, skipped or failed state. The scheduler probably did not run (a late or dropped GitHub schedule).",
        next: "Check the posts-publish runs of that day. The slot cannot be published late: move the record to a new date in a new PR (P11).",
      }),
    });
  }
}

// --- b. missed slots (PST-12) ------------------------------------------------------------------

async function missedSlots(d: DailyDeps, records: Rec[], say: Say): Promise<void> {
  let wrote = false;
  for (const { record, stem } of records) {
    if (record.ai_label) continue;
    if (slotState(record, d.now) !== "missed") continue;
    let state: PostState | null = null;
    for (const platform of AUTOMATIC_PLATFORMS) {
      if (!record.platforms[platform]) continue;
      state ??= (await d.store.read(stem)) ?? emptyState();
      const current: PostState = state;
      const status = effectiveStatus(record, current, platform);
      if (status !== "ready" && status !== "queued") continue;
      const cur: StateEntry | null = current.platforms[platform] ?? null;
      const log = (text: string): void => say(`${stem} ${platform}: ${text}`);
      if (d.dryRun) {
        log("window ended, would be skipped");
        continue;
      }
      let next: StateEntry | null = null;
      if (cur?.status === "queued" && cur.platform_id) {
        // PST-13: a queued post may already be public; ask before skipping.
        const publicUrl = await isPublic(d, platform, cur.platform_id).catch(() => null);
        if (publicUrl !== null) {
          next = {
            ...cur,
            status: "published",
            url: publicUrl.url,
            published_at: d.now.toISOString(),
            error: null,
          };
          log("was already public, recorded as published");
        }
      }
      if (next === null) {
        const deadYoutube = platform === "youtube" && cur?.status === "queued" && !cur.platform_id;
        const issue = await upsertIssue(d.gh, {
          kind: "post-alert",
          stem,
          platform,
          body: alertBody({
            record,
            platform,
            what: deadYoutube
              ? "The upload started but no video id was stored, and the window ended."
              : "Not published inside the window. It is skipped and never published late.",
            next: deadYoutube
              ? "Check YouTube Studio for this video. A new time needs a new record."
              : "A new time needs a new record.",
          }),
        });
        next = {
          ...(cur ?? blank()),
          status: deadYoutube ? "failed" : "skipped",
          issue,
          ...(deadYoutube ? { error: { http_status: null, code: "no_video_id" } } : {}),
        };
        log(
          deadYoutube ? "queued without a video id, set to failed" : "window ended, set to skipped",
        );
      }
      state = { ...current, platforms: { ...current.platforms, [platform]: next } };
      await d.store.write(stem, state);
      wrote = true;
    }
  }
  if (wrote) await d.store.commitAndPush("chore(posts-state): missed slots");
}

async function isPublic(
  d: DailyDeps,
  platform: PostPlatform,
  id: string,
): Promise<{ url: string | null } | null> {
  if (platform === "instagram") {
    return (await d.instagram.containerStatus(id)) === "PUBLISHED" ? { url: null } : null;
  }
  const token = mask(await d.youtube.accessToken(), d.out);
  const status = await d.youtube.videoStatus(token, id);
  return status?.privacyStatus === "public" && !status.rejected
    ? { url: `https://www.youtube.com/shorts/${id}` }
    : null;
}

// --- d. cron coverage (PST-23, PST-11) ---------------------------------------------------------

async function cronCoverage(d: DailyDeps, say: Say): Promise<void> {
  const expected = cronLines(d.postTime, POST_TIMEZONE, POST_DAYS, d.now);
  const found = d.workflowText === null ? null : extractCronLines(d.workflowText);
  const norm = (list: readonly string[]): string => [...list].sort().join("\n");
  if (found !== null && norm(found) === norm(expected)) {
    say("cron-coverage: ok");
    return;
  }
  say("cron-coverage: the cron lines do not match the expected ones");
  if (d.dryRun) return;
  await upsertIssue(d.gh, {
    kind: "post-alert",
    stem: "ops-cron-lines",
    platform: "all",
    body: lines(
      `File: ${SCHEDULER_WORKFLOW}`,
      found === null ? "The file was not found." : `Found: ${found.join(" | ") || "no cron line"}`,
      `Expected for POST_TIME ${d.postTime} ${POST_TIMEZONE}: ${expected.join(" | ")}`,
      "Next step: change the cron lines of the scheduler workflow through a PR titled `ops-workflow:`.",
    ),
  });
}

// --- e. trust checks (PST-33) ------------------------------------------------------------------

async function trustChecks(d: DailyDeps, say: Say, raise: Raise): Promise<void> {
  const since = new Date(d.now.getTime() - TRUST_LOOKBACK_DAYS * DAY_MS).toISOString();
  // (a) a commit on main under .github/workflows/ that is not the merge commit of a merged PR
  for (const sha of await d.gh.listCommitsOfPath(".github/workflows", "main", since)) {
    const pulls = await d.gh.pullsOfCommit(sha);
    if (pulls.some((p) => p.merged_at !== null && p.merge_commit_sha === sha)) continue;
    const files = (await d.gh.commitFiles(sha)).filter((f) => f.startsWith(WORKFLOWS_DIR));
    await raise("trust", {
      title: issueTitle("ops-security", `workflow-push-${sha.slice(0, 7)}`, "all"),
      labels: ["ops-security"],
      once: true,
      body: lines(
        "A file under .github/workflows/ on main was changed by a commit that is not the merge commit of a merged PR.",
        `File: ${files.join(", ") || "(not listed)"}`,
        `Commit: ${sha}`,
        "Next step: check that you made this change. If not, treat every secret as exposed (PST-32).",
      ),
    });
  }
  // (b) another branch with workflow changes, unless it is the head of an open ops-workflow: PR
  const open = await d.gh.listOpenPulls();
  for (const branch of await d.gh.listBranches()) {
    if (branch.name === "main") continue;
    const files = (await d.gh.compareFiles("main", branch.name)).filter((f) =>
      f.startsWith(WORKFLOWS_DIR),
    );
    if (files.length === 0) continue;
    const pr = open.find((p) => p.head_ref === branch.name && p.title.startsWith("ops-workflow:"));
    if (pr) {
      await raise("trust", {
        title: issueTitle("ops-security", `ops-workflow-pr-${pr.number}`, "all"),
        labels: ["ops-security"],
        once: true,
        body: lines(
          "Low priority notice.",
          `The open PR #${pr.number} (title starts with ops-workflow:) changes workflow files: ${files.join(", ")}.`,
          "Next step: review it as a security change before merging (PST-32).",
        ),
      });
      continue;
    }
    await raise("trust", {
      title: issueTitle("ops-security", `workflow-branch-${branch.sha.slice(0, 7)}`, "all"),
      labels: ["ops-security"],
      once: true,
      body: lines(
        `The branch ${branch.name} changes workflow files compared with main, and no open ops-workflow: PR has it as its head.`,
        `File: ${files.join(", ")}`,
        `Commit: ${branch.sha}`,
        "Next step: delete the branch, or open an ops-workflow: PR for it. A workflow on any branch can read the repository secrets (T3).",
      ),
    });
  }
  say("trust: checked");
}

// --- f. cancelled runs (PST-11) ----------------------------------------------------------------

async function cancelledRuns(d: DailyDeps, say: Say, raise: Raise): Promise<void> {
  const oldest = d.now.getTime() - CANCELLED_LOOKBACK_DAYS * DAY_MS;
  for (const file of WATCHED_WORKFLOWS) {
    for (const run of await d.gh.listWorkflowRuns(file)) {
      if (run.conclusion !== "cancelled") continue;
      if (new Date(run.created_at).getTime() < oldest) continue;
      await raise("runs", {
        title: issueTitle("post-alert", `run-${run.id}`, "all"),
        labels: ["post-alert"],
        once: true,
        body: lines(
          `Run id: ${run.id}`,
          `Workflow: ${file}`,
          `Started: ${run.created_at}`,
          "This run was cancelled (GitHub keeps one pending run per concurrency group). Its work may be missing.",
          "Next step: check that the post of that day went out; the next runs reconcile the rest.",
        ),
      });
    }
  }
  say("runs: checked");
}

// --- g. verification and Content ID (PST-19, #270 part) ----------------------------------------

async function verification(d: DailyDeps, records: Rec[], say: Say, raise: Raise): Promise<void> {
  let wrote = false;
  for (const { record, stem } of records) {
    const state = await d.store.read(stem);
    if (!state) continue;
    const yt = state.platforms.youtube;
    if (yt?.status === "published" && yt.published_at) {
      const published = localDate(new Date(yt.published_at), record.timezone);
      const yesterday = localDate(new Date(d.now.getTime() - DAY_MS), record.timezone);
      const oldest = localDate(new Date(d.now.getTime() - 7 * DAY_MS), record.timezone);
      if (published <= yesterday && published >= oldest) {
        await raise(stem, {
          title: `Check Content ID claims in Studio for ${stem}`,
          labels: ["post-reminder"],
          once: true,
          body: lines(
            `Post: ${stem}`,
            yt.url ? `Video: ${yt.url}` : null,
            "Open YouTube Studio, Content, and check this video for Content ID claims or copyright notices. Close this issue when it is clear.",
          ),
        });
      }
    }
    const ig = state.platforms.instagram;
    if (ig?.status === "published" && ig.url === null && ig.platform_id) {
      if (d.dryRun) {
        say(`${stem} instagram: would try to read the permalink`);
        continue;
      }
      const url = await d.instagram.permalink(ig.platform_id).catch(() => null);
      if (url) {
        await d.store.write(stem, {
          ...state,
          platforms: { ...state.platforms, instagram: { ...ig, url } },
        });
        wrote = true;
        say(`${stem} instagram: permalink recorded`);
      } else {
        await raise(stem, {
          title: `Instagram permalink for ${stem}`,
          labels: ["post-reminder"],
          once: true,
          body: lines(
            `Post: ${stem}`,
            "The post is published, but the API did not give its permalink.",
            "Next step: open the post in the Instagram app, copy its link and paste it in this issue. Claude records it.",
          ),
        });
      }
    }
  }
  if (wrote) await d.store.commitAndPush("chore(posts-state): instagram permalinks");
}

// --- h. records still open at post time (T18) --------------------------------------------------

async function unmerged(d: DailyDeps, say: Say): Promise<void> {
  await runAutoMerge({
    gh: d.gh,
    now: d.now,
    postTime: d.postTime,
    dryRun: d.dryRun,
    runId: "0",
    out: say,
    alertOnly: true,
  });
}
