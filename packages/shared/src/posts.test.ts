import { describe, expect, it } from "vitest";
import {
  buildUtmLink,
  effectiveStatus,
  isInsideWindow,
  isPostDay,
  isPostTime,
  isSlotMissed,
  PostRecordSchema,
  PostStateSchema,
  recordStem,
  slotInstant,
  slotState,
  type ValidateRecordContext,
  validateRecord,
} from "./posts";

/** Synthetic record in the PST-04 shape. 2030-01-01 is a Tuesday. */
const valid = () => ({
  schema: 1,
  slug: "restart-after-gap",
  date: "2030-01-01",
  time: "19:00",
  timezone: "America/Sao_Paulo",
  pillar: "restart",
  format: "steps",
  video: { release: "post-2030-01-01-restart-after-gap", asset: "a.mp4", sha256: "a".repeat(64) },
  music_license: "license-ref",
  ai_label: false,
  platforms: {
    instagram: {
      status: "ready",
      caption: "c",
      hashtags: ["#a"],
      link: null,
      alt_text: "alt",
      text_version: "t",
    },
    youtube: {
      status: "ready",
      title: "T",
      caption: "c",
      hashtags: [],
      link: null,
      alt_text: null,
      text_version: "t",
    },
    linkedin: {
      status: "draft",
      caption: "",
      hashtags: [],
      link: null,
      alt_text: null,
      text_version: "",
    },
  },
});

const context = (over: Partial<ValidateRecordContext> = {}): ValidateRecordContext => ({
  path: "posts/2030/2030-01-01-restart-after-gap.json",
  existingSlugs: [],
  now: new Date("2029-12-20T12:00:00Z"),
  ...over,
});

const codes = (record: unknown, ctx = context()) =>
  validateRecord(record, ctx).map((failure) => failure.code);

describe("posts schemas (PST-04, PST-07)", () => {
  it("PST-04 accepts a valid record and rejects unknown keys at every level", () => {
    expect(PostRecordSchema.safeParse(valid()).success).toBe(true);
    expect(PostRecordSchema.safeParse({ ...valid(), extra: 1 }).success).toBe(false);
    const nested = valid();
    Object.assign(nested.platforms.instagram, { token: "x" });
    expect(PostRecordSchema.safeParse(nested).success).toBe(false);
    const video = valid();
    Object.assign(video.video, { extra: 1 });
    expect(PostRecordSchema.safeParse(video).success).toBe(false);
    expect(PostRecordSchema.safeParse({ ...valid(), platforms: { facebook: {} } }).success).toBe(
      false,
    );
  });

  it("PST-04 rejects a wrong version, timezone, slug, hash and a title outside YouTube", () => {
    for (const bad of [
      { schema: 2 },
      { timezone: "UTC" },
      { slug: "one" },
      { slug: "Has-Capitals" },
      { slug: "a-b-c-d-e" },
      { slug: "abcdefghij-abcdefghij-abcdefghij" },
      { video: { release: "r", asset: "a", sha256: "xyz" } },
    ]) {
      expect(PostRecordSchema.safeParse({ ...valid(), ...bad }).success).toBe(false);
    }
    const titled = valid();
    Object.assign(titled.platforms.instagram, { title: "no" });
    expect(PostRecordSchema.safeParse(titled).success).toBe(false);
    const noTitle = valid();
    Reflect.deleteProperty(noTitle.platforms.youtube, "title");
    expect(PostRecordSchema.safeParse(noTitle).success).toBe(false);
  });

  it("PST-07 accepts a state file and rejects unknown keys and a bad status", () => {
    const entry = {
      status: "published",
      attempts: 1,
      platform_id: "123",
      url: "https://example.test/p/1",
      published_at: "2030-01-01T19:02:00-03:00",
      issue: null,
      error: null,
      metrics: { read_on: "2030-01-08", values: { Views: 10, Saves: null } },
    };
    const state = { schema: 1, platforms: { instagram: entry } };
    expect(PostStateSchema.safeParse(state).success).toBe(true);
    expect(PostStateSchema.safeParse({ ...state, extra: 1 }).success).toBe(false);
    expect(
      PostStateSchema.safeParse({
        schema: 1,
        platforms: { instagram: { ...entry, status: "ready" } },
      }).success,
    ).toBe(false);
    expect(
      PostStateSchema.safeParse({
        schema: 1,
        platforms: { instagram: { ...entry, published_at: "2030-01-01T19:02:00" } },
      }).success,
    ).toBe(false);
  });
});

describe("posts helpers (PST-05, PST-07)", () => {
  it("PST-05 builds the goals-and-KPIs link for each platform", () => {
    expect(buildUtmLink("linkedin", "restart-after-gap")).toBe(
      "https://careeros-taupe.vercel.app/?utm_source=linkedin&utm_medium=social&utm_campaign=restart-after-gap",
    );
    expect(buildUtmLink("tiktok", "restart-after-gap")).toContain("utm_source=tiktok&");
    expect(() => buildUtmLink("tiktok", "Bad Slug")).toThrow(RangeError);
  });

  it("PST-04 the stem is date plus slug", () => {
    expect(recordStem(valid())).toBe("2030-01-01-restart-after-gap");
  });

  it("PST-07 the effective status is the state status, else the record status", () => {
    const record = PostRecordSchema.parse(valid());
    const state = PostStateSchema.parse({
      schema: 1,
      platforms: {
        instagram: {
          status: "queued",
          attempts: 1,
          platform_id: null,
          url: null,
          published_at: null,
          issue: null,
          error: null,
          metrics: null,
        },
      },
    });
    expect(effectiveStatus(record, state, "instagram")).toBe("queued");
    expect(effectiveStatus(record, state, "youtube")).toBe("ready");
    expect(effectiveStatus(record, null, "instagram")).toBe("ready");
    expect(effectiveStatus(record, null, "tiktok")).toBeNull();
  });
});

describe("slot rules (PST-12)", () => {
  const slot = { date: "2030-01-01", time: "19:00", timezone: "America/Sao_Paulo" };

  it("PST-12 turns a São Paulo time into the right UTC instant", () => {
    expect(slotInstant("2030-01-01", "19:00").toISOString()).toBe("2030-01-01T22:00:00.000Z");
  });

  it("PST-12 the window across midnight UTC keeps the local date and weekday", () => {
    // 22:00 São Paulo on Tuesday 2030-01-01 is 01:00 UTC on Wednesday 2030-01-02.
    const late = { ...slot, time: "22:00" };
    expect(slotInstant(late.date, late.time).toISOString()).toBe("2030-01-02T01:00:00.000Z");
    expect(isPostDay("2030-01-01")).toBe(true);
    expect(isInsideWindow(late, new Date("2030-01-02T01:30:00Z"))).toBe(true);
    expect(isInsideWindow(late, new Date("2030-01-02T02:30:00Z"))).toBe(true);
    expect(isInsideWindow(late, new Date("2030-01-02T02:31:00Z"))).toBe(false);
  });

  it("PST-12 is future before the time, due inside the window, missed after it", () => {
    expect(slotState(slot, new Date("2030-01-01T21:59:59Z"))).toBe("future");
    expect(slotState(slot, new Date("2030-01-01T22:00:00Z"))).toBe("due");
    expect(slotState(slot, new Date("2030-01-01T23:30:00Z"))).toBe("due");
    expect(slotState(slot, new Date("2030-01-01T23:30:01Z"))).toBe("missed");
    expect(isSlotMissed(slot, new Date("2030-01-02T10:00:00Z"))).toBe(true);
    expect(isSlotMissed(slot, new Date("2030-01-01T22:10:00Z"))).toBe(false);
  });

  it("PST-09 knows POST_DAYS and POST_TIME", () => {
    expect(isPostDay("2030-01-01")).toBe(true); // Tuesday
    expect(isPostDay("2030-01-03")).toBe(true); // Thursday
    expect(isPostDay("2030-01-02")).toBe(false); // Wednesday
    expect(isPostTime("19:00")).toBe(true);
    expect(isPostTime("19:15")).toBe(false);
    expect(isPostTime("21:00", "21:00")).toBe(true);
  });
});

describe("validateRecord (PST-09)", () => {
  it("PST-09 passes a valid record", () => {
    expect(validateRecord(valid(), context())).toEqual([]);
  });

  it("PST-09 reports schema errors with the field path, and unknown keys", () => {
    const failures = validateRecord({ ...valid(), extra: 1, slug: "x" }, context());
    expect(failures.every((failure) => failure.code === "schema")).toBe(true);
    expect(failures.length).toBeGreaterThanOrEqual(2);
    expect(failures.some((failure) => failure.message.startsWith("slug"))).toBe(true);
    expect(codes("not an object")).toEqual(["schema"]);
  });

  it("PST-09 fails when the stem or the year folder does not match date and slug", () => {
    expect(codes(valid(), context({ path: "posts/2030/2030-01-01-other-slug.json" }))).toEqual([
      "stem",
    ]);
    expect(
      codes(valid(), context({ path: "posts/2029/2030-01-01-restart-after-gap.json" })),
    ).toEqual(["stem"]);
  });

  it("PST-09 fails on a reused slug", () => {
    expect(codes(valid(), context({ existingSlugs: ["other-idea", "restart-after-gap"] }))).toEqual(
      ["duplicate-slug"],
    );
  });

  it("PST-09 fails on an empty required field of a ready platform only", () => {
    const record = valid();
    record.platforms.instagram.caption = " ";
    record.platforms.youtube.title = "";
    const failures = validateRecord(record, context());
    expect(failures.map((f) => `${f.platform}:${f.code}`)).toEqual([
      "instagram:empty-field",
      "youtube:empty-field",
    ]);
    // The linkedin entry is a draft with empty fields and does not fail.
  });

  it("PST-05 fails a typed link that differs from the generated one, and any YouTube link", () => {
    const record = valid();
    Object.assign(record.platforms.instagram, {
      link: `${buildUtmLink("instagram", "restart-after-gap")}&x=1`,
    });
    expect(codes(record)).toEqual(["link"]);
    const wrongSource = valid();
    Object.assign(wrongSource.platforms.instagram, {
      link: buildUtmLink("tiktok", "restart-after-gap"),
    });
    expect(codes(wrongSource)).toEqual(["link"]);
    const exact = valid();
    Object.assign(exact.platforms.instagram, {
      link: buildUtmLink("instagram", "restart-after-gap"),
    });
    expect(codes(exact)).toEqual([]);
    const youtube = valid();
    Object.assign(youtube.platforms.youtube, { link: buildUtmLink("tiktok", "restart-after-gap") });
    expect(codes(youtube)).toEqual(["link"]);
  });

  it("PST-09 fails when the date is not a post day or the time is not POST_TIME", () => {
    const wednesday = { ...valid(), date: "2030-01-02" };
    expect(
      codes(wednesday, context({ path: "posts/2030/2030-01-02-restart-after-gap.json" })),
    ).toEqual(["post-day"]);
    expect(codes({ ...valid(), time: "20:00" })).toEqual(["post-time"]);
    expect(codes({ ...valid(), time: "20:00" }, context({ postTime: "20:00" }))).toEqual([]);
  });

  it("PST-09 fails when the time is already past, unless the check is turned off", () => {
    const after = context({ now: new Date("2030-01-01T22:00:00Z") });
    expect(codes(valid(), after)).toEqual(["past"]);
    expect(codes(valid(), context({ ...after, checkPast: false }))).toEqual([]);
    expect(codes(valid(), context({ now: new Date("2030-01-01T21:59:00Z") }))).toEqual([]);
  });

  it("PST-09 checks the measured asset values the caller passes", () => {
    const ok = { found: true, sha256: "a".repeat(64), width: 1080, height: 1920, durationS: 30 };
    expect(codes(valid(), context({ asset: ok }))).toEqual([]);
    expect(codes(valid(), context({ asset: { ...ok, found: false } }))).toEqual(["asset-missing"]);
    expect(codes(valid(), context({ asset: { ...ok, sha256: "b".repeat(64) } }))).toEqual([
      "asset-sha256",
    ]);
    expect(codes(valid(), context({ asset: { ...ok, width: 1920, height: 1080 } }))).toEqual([
      "video-size",
    ]);
    expect(codes(valid(), context({ asset: { ...ok, durationS: 19 } }))).toEqual([
      "video-duration",
    ]);
    expect(codes(valid(), context({ asset: { ...ok, durationS: 46 } }))).toEqual([
      "video-duration",
    ]);
    expect(codes(valid(), context({ asset: { ...ok, durationS: 45 } }))).toEqual([]);
  });

  it("PST-09 returns every failure at once", () => {
    const record = { ...valid(), time: "20:00", date: "2030-01-02" };
    expect(codes(record, context({ existingSlugs: ["restart-after-gap"] }))).toEqual([
      "stem",
      "duplicate-slug",
      "post-day",
      "post-time",
    ]);
  });
});
