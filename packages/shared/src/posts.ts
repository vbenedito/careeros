/**
 * Posts pipeline (specs/v1/04-posts-pipeline.md): record schema (PST-04), state schema (PST-07),
 * the generated UTM link (PST-05), slot and window rules (PST-12) and the pure part of the PR
 * check (PST-09). The files live in a private repository; every object is strict, so an unknown
 * key is a failure. This file imports only `zod` so a Node script can load it directly.
 */
import { z } from "zod";

/** specs/v1/04-posts-pipeline.md §2 */
export const POSTS_SCHEMA_VERSION = 1;
export const POST_TIMEZONE = "America/Sao_Paulo";
export const POST_DAYS = ["Tuesday", "Thursday"] as const;
/** Spec §2 says the value is an ops-repo variable; this is the default used by pure checks. */
export const POST_TIME = "19:00";
export const PUBLISH_WINDOW_MIN = 90;
/** P6 (2026-11-25): the record PR is open at least this long before the post. */
export const VETO_WINDOW_H = 20;
/** P6: auto-merge from post time minus this many hours. */
export const AUTO_MERGE_LEAD_H = 2;
export const MAX_ATTEMPTS = 3;
export const SCHEDULER_STEP_MIN = 15;
/** PST-22.1, PST-23: warn when a token has less than this many days left. */
export const IG_TOKEN_WARN_DAYS = 14;
export const OPS_PAT_WARN_DAYS = 14;
export const VIDEO_MIN_S = 20;
export const VIDEO_MAX_S = 45;
export const VIDEO_WIDTH = 1080;
export const VIDEO_HEIGHT = 1920;
export const POST_PLATFORMS = ["instagram", "tiktok", "youtube", "linkedin"] as const;
/** Landing page of goals and KPIs §6 and the launch kit. */
export const POSTS_LANDING_URL = "https://careeros-taupe.vercel.app/";

export type PostPlatform = (typeof POST_PLATFORMS)[number];
export type RecordStatus = "draft" | "ready" | "skipped";
export type StateStatus = "queued" | "published" | "failed" | "skipped";
export type EffectiveStatus = RecordStatus | StateStatus;

/** PST-34: name of a render script in `scripts/video/`. */
const RENDER_NAME = /^v\d{2}_[a-z0-9_]+$/;
/** P8: music composed in code; the seed is digits. */
const ORIGINAL_MUSIC = /^original:careeros_music:\d+$/;

/** P8: a non-empty license reference, or the original-music form with a digits seed. */
export function isValidMusicLicense(value: string): boolean {
  if (value.trim() === "") return false;
  return value.startsWith("original:") ? ORIGINAL_MUSIC.test(value) : true;
}

const Count = z.number().int().nonnegative();
const HASHTAG = /^#\S+$/;

/** 2 to 4 lowercase words (letters and digits) joined by hyphens, at most 30 characters. */
export const PostSlugSchema = z
  .string()
  .max(30)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+){1,3}$/);

const PlatformFields = {
  status: z.enum(["draft", "ready", "skipped"]),
  caption: z.string(),
  hashtags: z.array(z.string().regex(HASHTAG)),
  link: z.string().nullable(),
  alt_text: z.string().nullable(),
  text_version: z.string(),
};

export const PostPlatformEntrySchema = z.object(PlatformFields).strict();
/** `title` exists for YouTube only; there `caption` is the description. */
export const PostYoutubeEntrySchema = z.object({ ...PlatformFields, title: z.string() }).strict();

export const PostRecordSchema = z
  .object({
    schema: z.literal(POSTS_SCHEMA_VERSION),
    slug: PostSlugSchema,
    date: z.iso.date(),
    time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
    timezone: z.literal(POST_TIMEZONE),
    pillar: z.string().min(1),
    format: z.string().min(1),
    video: z
      .object({
        release: z.string().min(1),
        asset: z.string().min(1),
        sha256: z.string().regex(/^[0-9a-f]{64}$/),
      })
      .strict(),
    /** PST-34: optional render script name, e.g. `v02_restart_after_gap`. */
    render: z.string().regex(RENDER_NAME).optional(),
    music_license: z
      .string()
      .min(1)
      .refine(isValidMusicLicense, "use a license reference or original:careeros_music:<digits>"),
    ai_label: z.boolean(),
    /** A platform not used for this post is left out. */
    platforms: z
      .object({
        instagram: PostPlatformEntrySchema.optional(),
        tiktok: PostPlatformEntrySchema.optional(),
        youtube: PostYoutubeEntrySchema.optional(),
        linkedin: PostPlatformEntrySchema.optional(),
      })
      .strict(),
  })
  .strict();

const StatePlatformSchema = z
  .object({
    status: z.enum(["queued", "published", "failed", "skipped"]),
    attempts: Count,
    /** Container id, publish id or video id. */
    platform_id: z.string().min(1).nullable(),
    url: z.string().min(1).nullable(),
    /** ISO 8601 with offset. */
    published_at: z.iso.datetime({ offset: true }).nullable(),
    /** Number of the open reminder or alert issue. */
    issue: z.number().int().positive().nullable(),
    /** HTTP status and the API's error code only (PST-20). */
    error: z
      .object({ http_status: Count.nullable(), code: z.string().min(1).nullable() })
      .strict()
      .nullable(),
    /** Day-7 numbers (PST-27): the app's own metric names, `null` for a number not available. */
    metrics: z
      .object({
        read_on: z.iso.date(),
        values: z.record(z.string().min(1), z.number().nullable()),
      })
      .strict()
      .nullable(),
  })
  .strict();

/** PST-07: `posts-state/YYYY/<stem>.json`, written only by the pipeline. */
export const PostStateSchema = z
  .object({
    schema: z.literal(POSTS_SCHEMA_VERSION),
    platforms: z
      .object({
        instagram: StatePlatformSchema.optional(),
        tiktok: StatePlatformSchema.optional(),
        youtube: StatePlatformSchema.optional(),
        linkedin: StatePlatformSchema.optional(),
      })
      .strict(),
  })
  .strict();

/** PST-22 step 5: `posts-state/tokens.json` holds expiry dates only, never a value. */
export const PostTokensSchema = z
  .object({
    schema: z.literal(POSTS_SCHEMA_VERSION),
    checked_on: z.iso.date(),
    instagram: z
      .object({ ok: z.boolean(), expires_on: z.iso.date().nullable() })
      .strict()
      .optional(),
    youtube: z.object({ ok: z.boolean() }).strict().optional(),
    ops_pat: z.object({ expires_on: z.iso.date().nullable() }).strict().optional(),
  })
  .strict();

export type PostRecord = z.infer<typeof PostRecordSchema>;
export type PostTokens = z.infer<typeof PostTokensSchema>;
export type PostState = z.infer<typeof PostStateSchema>;

/** PST-05: the only link a record may hold, generated and never typed. */
export function buildUtmLink(platform: PostPlatform, slug: string): string {
  if (!PostSlugSchema.safeParse(slug).success) throw new RangeError("buildUtmLink: invalid slug");
  const query = new URLSearchParams({
    utm_source: platform,
    utm_medium: "social",
    utm_campaign: slug,
  });
  return `${POSTS_LANDING_URL}?${query.toString()}`;
}

/** PST-04: the file stem, also the video stem. */
export function recordStem(record: Pick<PostRecord, "date" | "slug">): string {
  return `${record.date}-${record.slug}`;
}

/** PST-07: the state status when there is one, else the record status. */
export function effectiveStatus(
  record: PostRecord,
  state: PostState | null,
  platform: PostPlatform,
): EffectiveStatus | null {
  const fromState = state?.platforms[platform]?.status;
  return fromState ?? record.platforms[platform]?.status ?? null;
}

// --- Time zone math (no date library) -------------------------------------------------------

/** The wall-clock time of `instant` in `timeZone`, read back as if it were UTC. */
function wallClockAsUtc(instant: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const fields = new Map<string, number>();
  for (const part of formatter.formatToParts(instant)) fields.set(part.type, Number(part.value));
  const get = (type: string): number => fields.get(type) ?? Number.NaN;
  return Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
}

/** Offset of `timeZone` from UTC at `instant`, in ms (UTC-3 gives -10800000). */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  return wallClockAsUtc(instant, timeZone) - Math.floor(instant.getTime() / 1000) * 1000;
}

/** The instant at which the wall clock of `timeZone` reads `date` `time`. */
export function slotInstant(date: string, time: string, timeZone: string = POST_TIMEZONE): Date {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const wall = Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1, hour ?? 0, minute ?? 0);
  const first = wall - zoneOffsetMs(new Date(wall), timeZone);
  // A second pass settles the guess when the offset differs at the guessed instant (DST).
  return new Date(wall - zoneOffsetMs(new Date(first), timeZone));
}

/** The weekday of a calendar date (no time zone involved: the date is already local). */
export function weekdayOfDate(date: string): (typeof WEEKDAYS)[number] {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return WEEKDAYS[day] ?? "Sunday";
}
const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/** PST-09: the local date is a `POST_DAYS` day. */
export function isPostDay(date: string): boolean {
  return (POST_DAYS as readonly string[]).includes(weekdayOfDate(date));
}

/** PST-09: the time is `POST_TIME`. */
export function isPostTime(time: string, postTime: string = POST_TIME): boolean {
  return time === postTime;
}

type Slot = { date: string; time: string; timezone: string };
export type SlotState = "future" | "due" | "missed";

/**
 * PST-12: `future` before the time, `due` from the time to `PUBLISH_WINDOW_MIN` after it (the
 * end is inside), `missed` after that. A `missed` platform that is not published is `skipped`.
 */
export function slotState(
  slot: Slot,
  now: Date,
  windowMin: number = PUBLISH_WINDOW_MIN,
): SlotState {
  const start = slotInstant(slot.date, slot.time, slot.timezone).getTime();
  const t = now.getTime();
  if (t < start) return "future";
  return t <= start + windowMin * 60_000 ? "due" : "missed";
}

export function isInsideWindow(slot: Slot, now: Date, windowMin?: number): boolean {
  return slotState(slot, now, windowMin) === "due";
}

export function isSlotMissed(slot: Slot, now: Date, windowMin?: number): boolean {
  return slotState(slot, now, windowMin) === "missed";
}

// --- PST-09: the pure checks ----------------------------------------------------------------

export const POST_FAILURE_CODES = [
  "schema",
  "stem",
  "duplicate-slug",
  "empty-field",
  "link",
  "post-time",
  "past",
  "asset-missing",
  "asset-sha256",
  "video-size",
  "video-duration",
  "render",
  "music-license",
] as const;
export type PostFailureCode = (typeof POST_FAILURE_CODES)[number];

export interface PostFailure {
  code: PostFailureCode;
  message: string;
  platform?: PostPlatform;
}

/** Values the caller measured (hash of the release asset, `ffprobe`); none is read here. */
export interface MeasuredAsset {
  found: boolean;
  sha256: string;
  width: number;
  height: number;
  durationS: number;
}

export interface ValidateRecordContext {
  /** Path of the record file; only the last two segments (`YYYY`, `<stem>.json`) are read. */
  path: string;
  /** Slugs of the other records. The record's own slug must not be in the list. */
  existingSlugs: readonly string[];
  now: Date;
  /** Defaults to `POST_TIME`. */
  postTime?: string;
  /** PST-10 repeats the validation without this check. Default true. */
  checkPast?: boolean;
  /** Omitted: the asset checks are not run (they need the network and `ffprobe`). */
  asset?: MeasuredAsset;
}

function requiredFields(
  platform: PostPlatform,
  entry: { caption: string; text_version: string; title?: string },
): string[] {
  const missing: string[] = [];
  if (entry.caption.trim() === "") missing.push("caption");
  if (entry.text_version.trim() === "") missing.push("text_version");
  if (platform === "youtube" && (entry.title ?? "").trim() === "") missing.push("title");
  return missing;
}

/** PST-09: every failure that needs no network and no `ffprobe`; an empty list means it passes. */
export function validateRecord(input: unknown, context: ValidateRecordContext): PostFailure[] {
  const parsed = PostRecordSchema.safeParse(input);
  if (!parsed.success) {
    return parsed.error.issues.map((issue) => ({
      code:
        issue.path[0] === "render"
          ? "render"
          : issue.path[0] === "music_license"
            ? "music-license"
            : "schema",
      message: `${issue.path.join(".") || "(record)"}: ${issue.message}`,
    }));
  }
  const record = parsed.data;
  const failures: PostFailure[] = [];
  const fail = (code: PostFailureCode, message: string, platform?: PostPlatform): void => {
    failures.push(platform ? { code, message, platform } : { code, message });
  };

  const segments = context.path.split(/[\\/]/);
  const fileName = segments.at(-1) ?? "";
  const folder = segments.at(-2) ?? "";
  const stem = recordStem(record);
  if (fileName !== `${stem}.json`)
    fail("stem", `file name must be ${stem}.json, found ${fileName}`);
  if (folder !== record.date.slice(0, 4)) {
    fail("stem", `folder must be ${record.date.slice(0, 4)}, found ${folder}`);
  }

  if (record.video.release !== `post-${stem}`) {
    fail("stem", `video.release must be post-${stem}, found ${record.video.release}`);
  }
  if (record.video.asset !== `${stem}.mp4`) {
    fail("stem", `video.asset must be ${stem}.mp4, found ${record.video.asset}`);
  }

  if (context.existingSlugs.includes(record.slug)) {
    fail("duplicate-slug", `slug ${record.slug} is already used by another record`);
  }

  for (const platform of POST_PLATFORMS) {
    const entry = record.platforms[platform];
    if (!entry) continue;
    if (entry.status === "ready") {
      for (const field of requiredFields(platform, entry)) {
        fail("empty-field", `${field} is empty on a ready platform`, platform);
      }
    }
    if (entry.link !== null) {
      if (platform === "youtube") {
        fail("link", "YouTube has no link in the description (PST-05)", platform);
      } else if (entry.link !== buildUtmLink(platform, record.slug)) {
        fail("link", "link differs from the generated buildUtmLink value", platform);
      }
    }
  }

  // P11 (2026-11-27): a record may be on any day. POST_DAYS stays the normal rhythm and the
  // days of the backup crons (`cronLines`); `isPostDay` is kept for the daily coverage check
  // of PST-23 (P2).
  const postTime = context.postTime ?? POST_TIME;
  if (!isPostTime(record.time, postTime)) fail("post-time", `time must be ${postTime}`);
  if (
    (context.checkPast ?? true) &&
    slotInstant(record.date, record.time, record.timezone).getTime() <= context.now.getTime()
  ) {
    fail("past", "the post time is already in the past");
  }

  const asset = context.asset;
  if (asset) {
    if (!asset.found) {
      fail("asset-missing", `release asset ${record.video.asset} not found`);
    } else {
      if (asset.sha256 !== record.video.sha256)
        fail("asset-sha256", "asset SHA-256 differs from video.sha256");
      if (asset.width !== VIDEO_WIDTH || asset.height !== VIDEO_HEIGHT) {
        fail(
          "video-size",
          `video is ${asset.width}x${asset.height}, expected ${VIDEO_WIDTH}x${VIDEO_HEIGHT}`,
        );
      }
      if (asset.durationS < VIDEO_MIN_S || asset.durationS > VIDEO_MAX_S) {
        fail(
          "video-duration",
          `video is ${asset.durationS}s, expected ${VIDEO_MIN_S} to ${VIDEO_MAX_S}s`,
        );
      }
    }
  }
  return failures;
}

// --- PST-11: cron lines and their coverage ----------------------------------------------------

/** The cron fires 7 minutes after the window start, then every `SCHEDULER_STEP_MIN`. */
const CRON_FIRST_OFFSET_MIN = 7;

/** Cron weekday numbers (Sunday = 0) of the weekday names. */
function cronWeekday(name: string): number {
  const index = (WEEKDAYS as readonly string[]).indexOf(name);
  if (index < 0) throw new RangeError(`cronLines: unknown weekday ${name}`);
  return index;
}

/**
 * PST-11, acceptance 4: cron lines (UTC) for the publish window of `postTime` in `timeZone` on
 * `postDays`, using the offset of `timeZone` at `now`. Fires start at 7 minutes past the window
 * start, every `SCHEDULER_STEP_MIN`, and stop at the window end. A part of the window after
 * midnight UTC uses the next weekday. Lines are `minutes hour * * weekdays`.
 */
export function cronLines(
  postTime: string,
  timeZone: string,
  postDays: readonly string[],
  now: Date,
): string[] {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(postTime))
    throw new RangeError("cronLines: bad postTime");
  const [hour = 0, minute = 0] = postTime.split(":").map(Number);
  const offsetMin = Math.round(zoneOffsetMs(now, timeZone) / 60_000);
  const startUtcMin = hour * 60 + minute - offsetMin; // may be outside 0..1439
  // (weekday, hour) -> minutes of the fires in that hour
  const buckets = new Map<string, Set<number>>();
  for (const day of postDays) {
    const base = cronWeekday(day) * 1440 + startUtcMin;
    for (let t = CRON_FIRST_OFFSET_MIN; t <= PUBLISH_WINDOW_MIN; t += SCHEDULER_STEP_MIN) {
      const abs = (((base + t) % 10080) + 10080) % 10080;
      const dow = Math.floor(abs / 1440);
      const h = Math.floor((abs % 1440) / 60);
      const key = `${h}:${dow}`;
      const set = buckets.get(key) ?? new Set<number>();
      set.add(abs % 60);
      buckets.set(key, set);
    }
  }
  // Merge weekdays that share the same hour and minutes.
  const merged = new Map<string, Set<number>>();
  for (const [key, minutes] of buckets) {
    const [h = "0", dow = "0"] = key.split(":");
    const lineKey = `${[...minutes].sort((a, b) => a - b).join(",")} ${h}`;
    const days = merged.get(lineKey) ?? new Set<number>();
    days.add(Number(dow));
    merged.set(lineKey, days);
  }
  return [...merged.entries()]
    .map(([lineKey, days]) => `${lineKey} * * ${[...days].sort((a, b) => a - b).join(",")}`)
    .sort();
}

function cronField(field: string, min: number, max: number): Set<number> | null {
  if (field === "*") return null;
  const values = new Set<number>();
  for (const part of field.split(",")) {
    const n = Number(part);
    if (!Number.isInteger(n) || n < min || n > max) throw new RangeError(`bad cron field ${field}`);
    values.add(n);
  }
  return values;
}

/** True when a line (`m h * * d`, numbers and lists only) fires at the UTC minute of `at`. */
function cronFires(line: string, at: Date): boolean {
  const parts = line.trim().split(/\s+/);
  if (parts.length !== 5 || parts[2] !== "*" || parts[3] !== "*") {
    throw new RangeError("cron line must be: minutes hours * * weekdays");
  }
  const [m, h, , , d] = parts as [string, string, string, string, string];
  const minutes = cronField(m, 0, 59);
  const hours = cronField(h, 0, 23);
  const days = cronField(d, 0, 7);
  const okDay = days === null || days.has(at.getUTCDay()) || (at.getUTCDay() === 0 && days.has(7));
  return (
    okDay &&
    (minutes === null || minutes.has(at.getUTCMinutes())) &&
    (hours === null || hours.has(at.getUTCHours()))
  );
}

/**
 * PST-23: the lines cover the slot when, between the slot instant and the window end, some line
 * fires within `SCHEDULER_STEP_MIN` of the start, no gap between fires is longer than that, and
 * the last fire is within that step of the window end.
 */
export function cronCovers(
  lines: readonly string[],
  slot: Date,
  windowMin: number = PUBLISH_WINDOW_MIN,
  stepMin: number = SCHEDULER_STEP_MIN,
): boolean {
  const startMin = Math.ceil(slot.getTime() / 60_000);
  let previous = startMin;
  let fired = false;
  for (let m = startMin; m <= startMin + windowMin; m++) {
    const at = new Date(m * 60_000);
    if (lines.some((line) => cronFires(line, at))) {
      if (m - previous > stepMin) return false;
      previous = m;
      fired = true;
    }
  }
  return fired && startMin + windowMin - previous <= stepMin;
}
