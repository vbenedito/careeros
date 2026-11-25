/**
 * PST-11..15, PST-18, PST-25 (P6): one scheduler run. For each record on `main` with a due slot
 * and an automatic platform (Instagram, YouTube): approval check, AI-label guard, hold check,
 * idempotent publish with state commits, retries for that platform only, an alert in the same
 * run, `skipped` + alert for a missed slot. TikTok and LinkedIn are not touched in P1.
 * With `dryRun` it reads, prints the plan, and writes nothing (acceptance 13).
 */
import {
  effectiveStatus,
  MAX_ATTEMPTS,
  POST_TIMEZONE,
  type PostPlatform,
  type PostRecord,
  PostRecordSchema,
  type PostState,
  PUBLISH_WINDOW_MIN,
  recordStem,
  slotInstant,
  slotState,
} from "../../packages/shared/src/posts.ts";
import { type VideoProbe, verifyRecordForPublish } from "./approval.ts";
import type { GitHubApi } from "./github.ts";
import { checkHold, HOLD_LABEL } from "./hold.ts";
import { ContainerFailedError, type InstagramApi, instagramCaption } from "./instagram.ts";
import { alertBody, describeSlot, findOpenIssue, upsertIssue } from "./issues.ts";
import { ApiError, errorInfo, mask, type Out } from "./mask.ts";
import { emptyState, StatePushError, type StateStore } from "./state.ts";
import { type YoutubeApi, youtubeDescription } from "./youtube.ts";

export const AUTOMATIC_PLATFORMS = [
  "instagram",
  "youtube",
] as const satisfies readonly PostPlatform[];
/** Slots older than this are left to the daily job (P2). */
export const MISSED_SWEEP_H = 24;
export const RETRY_LABEL = "retry";

export interface RecordFile {
  /** Repo-relative path, e.g. `posts/2026/2026-11-26-restart-after-gap.json`. */
  path: string;
  text: string;
}

export interface SchedulerDeps {
  gh: GitHubApi;
  store: StateStore;
  instagram: InstagramApi;
  youtube: YoutubeApi;
  probe: VideoProbe;
  files: readonly RecordFile[];
  now: Date;
  /** The current time, read again right before an irreversible call (H1). Default `() => new Date()`. */
  clock?: () => Date;
  postTime: string;
  approverLogin: string | null;
  dryRun: boolean;
  out: Out;
}

type ResolvedDeps = SchedulerDeps & { clock: () => Date };

export interface SchedulerReport {
  lines: string[];
  /** Platforms that failed or were skipped in this run (a non-zero exit). */
  failures: number;
  /** Errors that stopped one platform without a verdict (for example a GitHub 5xx). */
  errors: number;
}

type Entry = NonNullable<PostState["platforms"][PostPlatform]>;
const blank = (): Entry => ({
  status: "queued",
  attempts: 0,
  platform_id: null,
  url: null,
  published_at: null,
  issue: null,
  error: null,
  metrics: null,
});

/** Texts to copy when a post has to be made by hand. */
function textsOf(record: PostRecord, platform: PostPlatform): string {
  const e = record.platforms[platform];
  if (!e) return "";
  const parts: string[] = [];
  if ("title" in e && e.title) parts.push(`Title: ${e.title}`);
  parts.push(`Caption: ${e.caption}`);
  if (e.hashtags.length > 0) parts.push(`Hashtags: ${e.hashtags.join(" ")}`);
  if (e.link) parts.push(`Link: ${e.link}`);
  if (e.alt_text) parts.push(`Alt text: ${e.alt_text}`);
  parts.push(`Text version: ${e.text_version}`);
  return parts.join("\n");
}

export async function runScheduler(deps: SchedulerDeps): Promise<SchedulerReport> {
  const d: ResolvedDeps = { ...deps, clock: deps.clock ?? (() => new Date()) };
  const report: SchedulerReport = { lines: [], failures: 0, errors: 0 };
  const say = (line: string): void => {
    report.lines.push(line);
    d.out(line);
  };
  const maskValue = (value: string): string => mask(value, d.out);

  const parsed = d.files.map((file) => {
    let data: unknown = null;
    try {
      data = JSON.parse(file.text);
    } catch {
      // handled below
    }
    const result = PostRecordSchema.safeParse(data);
    return { file, record: result.success ? result.data : null };
  });
  const slugs = parsed.flatMap((p) => (p.record ? [p.record.slug] : []));

  for (const { file, record } of parsed.sort((a, b) => a.file.path.localeCompare(b.file.path))) {
    if (!record) {
      say(`invalid record file ${file.path}`);
      report.errors++;
      continue;
    }
    const slot = slotState(record, d.now);
    if (slot === "future") continue;
    const sweepEnd =
      slotInstant(record.date, record.time, record.timezone).getTime() +
      (PUBLISH_WINDOW_MIN + MISSED_SWEEP_H * 60) * 60_000;
    if (d.now.getTime() > sweepEnd) continue;
    for (const platform of AUTOMATIC_PLATFORMS) {
      if (!record.platforms[platform]) continue;
      const run = new PlatformRun(d, report, say, maskValue, {
        file,
        record,
        platform,
        slot,
        existingSlugs: slugs.filter((s) => s !== record.slug),
      });
      try {
        await run.handle();
      } catch (error) {
        const stem = recordStem(record);
        if (error instanceof StatePushError) {
          say(`${stem} ${platform}: state push failed, run stopped`);
          await run.alertPushFailure().catch(() => undefined);
          throw error;
        }
        const info = errorInfo(error);
        say(
          `${stem} ${platform}: error (http_status=${info.http_status ?? "none"}, code=${info.code ?? "none"})`,
        );
        report.errors++;
      }
    }
  }
  await alertNotMerged(d, report, say);
  return report;
}

/** T16: a record PR still open at post time gets one `post-alert` "record not merged". */
async function alertNotMerged(
  d: ResolvedDeps,
  report: SchedulerReport,
  say: (line: string) => void,
): Promise<void> {
  const pulls = await d.gh.listOpenPulls();
  for (const pull of pulls) {
    const files = await d.gh.listPullFiles(pull.number);
    const only = files.length === 1 ? files[0] : undefined;
    const match =
      only && /^posts\/\d{4}\/(\d{4}-\d{2}-\d{2})-([a-z0-9-]+)\.json$/.exec(only.filename);
    if (!match || only?.status !== "added") continue;
    const [, date = "", slug = ""] = match;
    const record = { date, slug, time: d.postTime, timezone: POST_TIMEZONE } as const;
    if (slotState(record, d.now) !== "due") continue;
    const stem = `${date}-${slug}`;
    say(`${stem}: record not merged at post time`);
    report.failures++;
    if (d.dryRun) continue;
    await upsertIssue(d.gh, {
      kind: "post-alert",
      stem,
      platform: "all",
      body: alertBody({
        record,
        platform: "all",
        what: `The record PR #${pull.number} is not merged at post time, so nothing is published.`,
        next: "Merge is closed for this slot unless it happens before the post time. Otherwise open a new record for a new slot.",
      }),
    });
  }
}

interface PlatformJob {
  file: RecordFile;
  record: PostRecord;
  platform: PostPlatform;
  slot: "due" | "missed";
  existingSlugs: readonly string[];
}

class PlatformRun {
  readonly #d: ResolvedDeps;
  readonly #report: SchedulerReport;
  readonly #say: (line: string) => void;
  readonly #mask: (value: string) => string;
  readonly #j: PlatformJob;
  readonly #stem: string;
  #state: PostState = emptyState();

  constructor(
    d: ResolvedDeps,
    report: SchedulerReport,
    say: (line: string) => void,
    maskValue: (value: string) => string,
    job: PlatformJob,
  ) {
    this.#d = d;
    this.#report = report;
    this.#say = say;
    this.#mask = maskValue;
    this.#j = job;
    this.#stem = recordStem(job.record);
  }

  get #cur(): Entry | null {
    return this.#state.platforms[this.#j.platform] ?? null;
  }

  #log(text: string): void {
    this.#say(`${this.#stem} ${this.#j.platform}: ${text}`);
  }

  // --- writes (all guarded by dry run) -------------------------------------------------------

  async #commit(entry: Entry | null, note: string): Promise<void> {
    const platforms = { ...this.#state.platforms };
    if (entry) platforms[this.#j.platform] = entry;
    else delete platforms[this.#j.platform];
    this.#state = { ...this.#state, platforms };
    await this.#d.store.write(this.#stem, this.#state);
    await this.#d.store.commitAndPush(
      `chore(posts-state): ${this.#stem} ${this.#j.platform} ${note}`,
    );
  }

  async #alert(
    input: Omit<Parameters<typeof alertBody>[0], "record" | "platform">,
  ): Promise<number | null> {
    return upsertIssue(this.#d.gh, {
      kind: "post-alert",
      stem: this.#stem,
      platform: this.#j.platform,
      body: alertBody({ ...input, record: this.#j.record, platform: this.#j.platform }),
    });
  }

  async alertPushFailure(): Promise<void> {
    await this.#alert({
      what: "The state commit could not be pushed, so the run stopped before the next publish step.",
      next: "Check the ops repository for a conflicting push, then run the scheduler again inside the window.",
    });
  }

  // --- the flow ------------------------------------------------------------------------------

  async handle(): Promise<void> {
    const { record, platform, slot } = this.#j;
    this.#state = (await this.#d.store.read(this.#stem)) ?? emptyState();
    const cur = this.#cur;
    const status = effectiveStatus(record, this.#state, platform);
    const deadYoutube =
      platform === "youtube" && cur?.status === "queued" && cur.platform_id === null;

    let retry = false;
    if (status === "failed" || deadYoutube) {
      const alertIssue = await findOpenIssue(this.#d.gh, "post-alert", this.#stem, platform);
      retry = alertIssue?.labels.includes(RETRY_LABEL) ?? false;
      if (retry && alertIssue && slot === "missed") {
        // PST-18: outside the window the retry is refused in a comment.
        if (!this.#d.dryRun) {
          await this.#d.gh.createComment(
            alertIssue.number,
            "The window has ended, so this post cannot be retried. A new time needs a new record.",
          );
          await this.#d.gh.removeLabel(alertIssue.number, RETRY_LABEL);
        }
        this.#log("retry refused, the window has ended");
        return;
      }
    }
    if (status !== "ready" && status !== "queued" && !(status === "failed" && retry)) return;

    if (slot === "missed") return this.#missed();
    return this.#due(retry, deadYoutube);
  }

  /** PST-12: never late. A queued post that is already public is recorded instead. */
  async #missed(): Promise<void> {
    const { record } = this.#j;
    if (record.ai_label) return; // reminder mode: the product owner posts by hand
    const cur = this.#cur;
    if (cur?.status === "queued" && cur.platform_id && !this.#d.dryRun) {
      try {
        if (await this.#resumeIsPublic(cur.platform_id)) return;
      } catch {
        // the platform could not be asked: the slot is skipped below
      }
    }
    this.#log("window ended, will be skipped");
    this.#report.failures++;
    if (this.#d.dryRun) return;
    const issue = await this.#alert({
      what: `Not published inside the ${PUBLISH_WINDOW_MIN}-minute window. It is skipped and never published late.`,
      next: "A new time needs a new record.",
    });
    await this.#commit({ ...(cur ?? blank()), status: "skipped", issue }, "skipped");
  }

  /** Read-only: is the queued id already public? Records `published` if so. */
  async #resumeIsPublic(id: string): Promise<boolean> {
    if (this.#j.platform === "instagram") {
      if ((await this.#d.instagram.containerStatus(id)) !== "PUBLISHED") return false;
      await this.#published(id, null, this.#cur?.attempts ?? 0);
      return true;
    }
    const token = this.#mask(await this.#d.youtube.accessToken());
    const status = await this.#d.youtube.videoStatus(token, id);
    if (status?.privacyStatus !== "public" || status.rejected) return false;
    await this.#published(id, `https://www.youtube.com/shorts/${id}`, this.#cur?.attempts ?? 0);
    return true;
  }

  async #due(retry: boolean, deadYoutube: boolean): Promise<void> {
    const { record, platform, file } = this.#j;
    const cur = this.#cur;

    if (platform === "youtube" && cur?.status === "queued" && cur.platform_id) {
      return this.#resumeYoutube(cur.platform_id, cur.attempts);
    }
    if (deadYoutube && !retry) {
      // PST-14a: never upload again by itself after a dead run.
      this.#log("queued without a video id, set to failed");
      this.#report.failures++;
      if (this.#d.dryRun) return;
      const issue = await this.#alert({
        what: "The upload started but no video id was stored.",
        next: "Check YouTube Studio for this video. If it is not there, add the label `retry`.",
      });
      await this.#commit(
        {
          ...(cur ?? blank()),
          status: "failed",
          issue,
          error: { http_status: null, code: "no_video_id" },
        },
        "failed",
      );
      return;
    }

    const verdict = await verifyRecordForPublish(this.#d.gh, {
      recordPath: file.path,
      recordText: file.text,
      approverLogin: this.#d.approverLogin,
      existingSlugs: this.#j.existingSlugs,
      now: this.#d.now,
      postTime: this.#d.postTime,
      probe: this.#d.probe,
      out: this.#d.out,
      mask: this.#mask,
    });
    if (!verdict.ok) {
      const codes = verdict.failures.map((f) => f.code).join(", ");
      this.#log(`not approved or invalid (${verdict.reason}${codes ? `: ${codes}` : ""})`);
      this.#report.failures++;
      if (this.#d.dryRun) return;
      const issue = await this.#alert({
        what: `${verdict.reason}${codes ? ` (${codes})` : ""}. Nothing was published.`,
        next: "Fix the record through a new merged PR for a new slot.",
      });
      await this.#commit(
        {
          ...(cur ?? blank()),
          status: "failed",
          issue,
          error: { http_status: null, code: "not_approved" },
        },
        "failed",
      );
      return;
    }

    if (record.ai_label) {
      // PST-15: no automatic post when the platform API has no AI-label field.
      this.#log("ai_label is true, reminder issue instead of an automatic post");
      if (this.#d.dryRun) return;
      await upsertIssue(this.#d.gh, {
        kind: "post-reminder",
        stem: this.#stem,
        platform,
        body: [
          `Post: ${this.#stem}`,
          `Platform: ${platform}`,
          `Time: ${describeSlot(record)}`,
          "First: set the AI label in the app (the API has no field for it). Then post by hand.",
          "",
          "Texts:",
          textsOf(record, platform),
          "",
          `Video: release ${record.video.release} in ${this.#d.gh.repo}`,
        ].join("\n"),
      });
      return;
    }

    const held = await checkHold(this.#d.gh, { stem: this.#stem, prNumber: verdict.prNumber });
    if (held.held) return this.#heldAlert(held.source);

    // PST-18: a `retry` label allows one more attempt.
    const base = retry ? MAX_ATTEMPTS - 1 : (cur?.attempts ?? 0);
    const job = {
      prNumber: verdict.prNumber,
      assetId: verdict.assetId,
      bytes: verdict.asset,
      // L4: a queued platform found at MAX_ATTEMPTS is asked as usual; a failure then ends in the alert.
      attempt: Math.min(base + 1, MAX_ATTEMPTS),
    };
    if (this.#d.dryRun) {
      this.#log(`would publish (attempt ${job.attempt} of ${MAX_ATTEMPTS})`);
      return;
    }
    if (retry) {
      const alertIssue = await findOpenIssue(this.#d.gh, "post-alert", this.#stem, platform);
      if (alertIssue) await this.#d.gh.removeLabel(alertIssue.number, RETRY_LABEL);
    }
    return platform === "instagram" ? this.#instagram(job) : this.#youtube(job);
  }

  async #heldAlert(source: string): Promise<void> {
    this.#log(`held by the label ${HOLD_LABEL} on ${source}`);
    this.#report.failures++;
    if (this.#d.dryRun) return;
    // The platform stays as it is; the missed-slot rule skips it if the window ends first.
    await this.#alert({
      what: `Not published: the label \`${HOLD_LABEL}\` is on ${source}.`,
      next: "Remove the label inside the window to let the next run continue. After the window the slot is skipped.",
    });
  }

  /** H1: the window closed before the irreversible call: skipped + alert, never published late. */
  #lateNow(): boolean {
    return slotState(this.#j.record, this.#d.clock()) !== "due";
  }

  async #lateSkip(platformId: string | null): Promise<void> {
    this.#log("window ended before the publish call, skipped");
    this.#report.failures++;
    const issue = await this.#alert({
      what: `The ${PUBLISH_WINDOW_MIN}-minute window ended before the publish call. It is skipped and never published late.`,
      next: "A new time needs a new record.",
    });
    await this.#commit(
      { ...(this.#cur ?? blank()), status: "skipped", platform_id: platformId, issue },
      "skipped",
    );
  }

  async #published(id: string, url: string | null, attempts: number): Promise<void> {
    await this.#commit(
      {
        ...(this.#cur ?? blank()),
        status: "published",
        attempts,
        platform_id: id,
        url,
        published_at: this.#d.clock().toISOString(),
        error: null,
      },
      "published",
    );
    this.#log("published");
    if (url === null) {
      // L2: no permalink yet; the P2 verification reads it. No extra API call now.
      this.#log("permalink to read in P2 verification");
      const open = await findOpenIssue(this.#d.gh, "post-alert", this.#stem, this.#j.platform);
      if (open && !this.#d.dryRun) {
        await this.#d.gh.updateIssue(open.number, {
          body: `${open.body}\nPublished. Permalink to read in P2 verification.`,
        });
      }
    }
  }

  /** A failed attempt: state, alert, in the same run (PST-18, PST-25). */
  async #fail(input: {
    attempt: number;
    platformId: string | null;
    error: unknown;
    what: string;
    forceFinal?: boolean;
    next?: string;
    texts?: string;
  }): Promise<void> {
    const info = errorInfo(input.error);
    const final = input.forceFinal === true || input.attempt >= MAX_ATTEMPTS;
    this.#report.failures++;
    this.#log(
      `${final ? "failed" : "attempt failed"} (http_status=${info.http_status ?? "none"}, code=${info.code ?? "none"})`,
    );
    const issue = await this.#alert({
      what: input.what,
      httpStatus: info.http_status,
      code: info.code,
      attempts: input.attempt,
      maxAttempts: MAX_ATTEMPTS,
      next:
        input.next ??
        (final
          ? "No more automatic attempts. Add the label `retry` to this issue to try once more inside the window."
          : "The next scheduler run retries this platform only."),
      ...(input.texts ? { texts: input.texts } : {}),
    });
    await this.#commit(
      {
        ...(this.#cur ?? blank()),
        status: final ? "failed" : "queued",
        attempts: input.attempt,
        platform_id: input.platformId,
        issue,
        error: { http_status: info.http_status, code: info.code },
      },
      final ? "failed" : "attempt failed",
    );
  }

  // --- Instagram (PST-14) ----------------------------------------------------------------------

  async #instagram(job: {
    prNumber: number;
    assetId: number;
    bytes: Uint8Array;
    attempt: number;
  }): Promise<void> {
    const ig = this.#d.instagram;
    const entry = this.#j.record.platforms.instagram;
    if (!entry) return;
    let containerId = this.#cur?.platform_id ?? null;
    try {
      if (containerId) {
        const status = await ig.containerStatus(containerId);
        if (status === "PUBLISHED") return this.#published(containerId, null, job.attempt);
        if (status === "ERROR" || status === "EXPIRED") containerId = null;
      }
      for (let tries = 0; tries < 2; tries++) {
        if (containerId === null) {
          const url = this.#mask(await this.#d.gh.assetSignedUrl(job.assetId));
          containerId = await ig.createReelContainer({
            videoUrl: url,
            caption: instagramCaption(entry),
          });
          // PST-13: queued with the container id is pushed before the container is published.
          await this.#commit(
            {
              ...(this.#cur ?? blank()),
              status: "queued",
              attempts: job.attempt,
              platform_id: containerId,
              error: null,
            },
            "queued",
          );
        }
        try {
          if ((await ig.waitUntilReady(containerId)) === "PUBLISHED") {
            return this.#published(containerId, null, job.attempt);
          }
          break;
        } catch (error) {
          // An expired URL inside the window is retried once with a new container and URL.
          if (error instanceof ContainerFailedError && error.status === "EXPIRED" && tries === 0) {
            containerId = null;
            continue;
          }
          throw error;
        }
      }
      if (containerId === null) throw new Error("no container");
      // PST-36: the hold is read again right before the irreversible call.
      const held = await checkHold(this.#d.gh, { stem: this.#stem, prNumber: job.prNumber });
      if (held.held) return this.#heldAlert(held.source);
      // H1: the clock is read again right before the irreversible call.
      if (this.#lateNow()) return this.#lateSkip(containerId);
      const mediaId = await ig.publish(containerId);
      let url: string | null = null;
      try {
        url = await ig.permalink(mediaId);
      } catch {
        // the post is public; the permalink is filled by the verification (P2)
      }
      return this.#published(mediaId, url, job.attempt);
    } catch (error) {
      if (error instanceof StatePushError) throw error;
      let id = error instanceof ContainerFailedError ? null : containerId;
      if (id) {
        // Unknown outcome (PST-13): ask the platform before recording a failure.
        try {
          if ((await ig.containerStatus(id)) === "PUBLISHED")
            return this.#published(id, null, job.attempt);
        } catch {
          // keep the id; the next run asks again
        }
      } else id = null;
      return this.#fail({
        attempt: job.attempt,
        platformId: id,
        error,
        what: "The Instagram upload did not finish.",
      });
    }
  }

  // --- YouTube (PST-14a) -----------------------------------------------------------------------

  async #youtube(job: { prNumber: number; bytes: Uint8Array; attempt: number }): Promise<void> {
    const yt = this.#d.youtube;
    const entry = this.#j.record.platforms.youtube;
    if (!entry || !("title" in entry)) return;
    const before = this.#cur;
    const token = this.#mask(await yt.accessToken());
    // Queued with no id is pushed BEFORE the upload starts (PST-13).
    await this.#commit(
      {
        ...(before ?? blank()),
        status: "queued",
        attempts: job.attempt,
        platform_id: null,
        error: null,
      },
      "queued",
    );
    // PST-36: hold again right before the upload; a hold here undoes the queued marker.
    const held = await checkHold(this.#d.gh, { stem: this.#stem, prNumber: job.prNumber });
    if (held.held) {
      await this.#commit(before, "held, restored");
      return this.#heldAlert(held.source);
    }
    if (this.#lateNow()) return this.#lateSkip(null);
    let id: string;
    try {
      const session = this.#mask(
        await yt.startUpload(token, {
          title: entry.title,
          description: youtubeDescription(entry),
          size: job.bytes.byteLength,
        }),
      );
      id = await yt.upload(session, job.bytes);
    } catch (error) {
      // The upload may have created a video: failed, never an automatic second upload.
      return this.#fail({
        attempt: job.attempt,
        platformId: null,
        error,
        forceFinal: true,
        what: "The YouTube upload did not finish and the outcome is unknown.",
        next: "Check YouTube Studio for this video. If it is not there, add the label `retry`.",
      });
    }
    await this.#commit(
      {
        ...(this.#cur ?? blank()),
        status: "queued",
        attempts: job.attempt,
        platform_id: id,
        error: null,
      },
      "queued with id",
    );
    return this.#confirmYoutube(token, id, job.attempt);
  }

  async #resumeYoutube(id: string, attempts: number): Promise<void> {
    if (this.#d.dryRun) {
      this.#log("would ask YouTube for the status of the stored video id");
      return;
    }
    const attempt = Math.min(attempts + 1, MAX_ATTEMPTS);
    try {
      const token = this.#mask(await this.#d.youtube.accessToken());
      return await this.#confirmYoutube(token, id, attempt);
    } catch (error) {
      if (error instanceof StatePushError) throw error;
      return this.#fail({
        attempt,
        platformId: id,
        error,
        what: "The YouTube status could not be read.",
      });
    }
  }

  async #confirmYoutube(token: string, id: string, attempt: number): Promise<void> {
    let status: Awaited<ReturnType<YoutubeApi["videoStatus"]>>;
    try {
      status = await this.#d.youtube.videoStatus(token, id);
    } catch (error) {
      return this.#fail({
        attempt,
        platformId: id,
        error,
        what: "The YouTube status could not be read.",
      });
    }
    if (status?.privacyStatus === "public" && !status.rejected)
      return this.#published(id, `https://www.youtube.com/shorts/${id}`, attempt);
    return this.#fail({
      attempt,
      platformId: id,
      error: new ApiError("YouTube", null, "not_public"),
      forceFinal: true,
      what: "YouTube has the video, but it is not public or was rejected.",
      next: "Fix it in YouTube Studio. The texts are below.",
      texts: textsOf(this.#j.record, "youtube"),
    });
  }
}
