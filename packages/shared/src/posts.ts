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
    music_license: z.string().min(1),
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

export type PostRecord = z.infer<typeof PostRecordSchema>;
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
  "post-day",
  "post-time",
  "past",
  "asset-missing",
  "asset-sha256",
  "video-size",
  "video-duration",
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
      code: "schema",
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

  if (!isPostDay(record.date)) {
    fail(
      "post-day",
      `${record.date} is a ${weekdayOfDate(record.date)}, not ${POST_DAYS.join(" or ")}`,
    );
  }
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
