import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { loadPosts, parsePostFiles } from "./posts";
import { buildPosts, formatWhen, safeUrl } from "./posts-view";

const TOKEN = "test-token-not-real";
const SHA = (n: number) => String(n).padStart(40, "0");

/** Invented post records and states (never real URLs or ids). */
const entry = (status: string, extra: Record<string, unknown> = {}) => ({
  status,
  caption: "c",
  hashtags: ["#x"],
  link: null,
  alt_text: null,
  text_version: "t",
  ...extra,
});
const record = (date: string, slug: string, platforms: Record<string, unknown>) =>
  JSON.stringify({
    schema: 1,
    slug,
    date,
    time: "19:00",
    timezone: "America/Sao_Paulo",
    pillar: "your-real-week",
    format: "chart",
    video: {
      release: `post-${date}-${slug}`,
      asset: `${date}-${slug}.mp4`,
      sha256: "a".repeat(64),
    },
    music_license: "original:careeros_music:1",
    ai_label: false,
    platforms,
  });
const live = (url: string | null, extra: Record<string, unknown> = {}) => ({
  status: "published",
  attempts: 1,
  platform_id: "id-fixture",
  url,
  published_at: "2030-01-02T22:03:00.000Z",
  issue: null,
  error: null,
  metrics: null,
  ...extra,
});
const state = (platforms: Record<string, unknown>) => JSON.stringify({ schema: 1, platforms });

const RECORDS = [
  {
    name: "2030/2030-01-02-old-post.json",
    text: record("2030-01-02", "old-post", {
      instagram: entry("ready"),
      tiktok: entry("skipped"),
      youtube: entry("ready", { title: "Old post title" }),
    }),
  },
  {
    name: "2030/2030-01-09-new-post.json",
    text: record("2030-01-09", "new-post", {
      instagram: entry("ready"),
      youtube: entry("ready", { title: "New post title" }),
    }),
  },
  { name: "2030/2030-01-05-mismatch.json", text: record("2030-01-06", "mismatch", {}) },
  { name: "2030/2030-01-07-broken.json", text: "{not json" },
];
const STATES = [
  {
    name: "2030/2030-01-02-old-post.json",
    text: state({
      instagram: live("https://example.test/p/fixture1"),
      youtube: live(null, {
        status: "failed",
        url: null,
        published_at: null,
        error: { http_status: 403, code: "forbidden" },
      }),
    }),
  },
];

describe("posts parsing (ADM-21)", () => {
  it("ADM-21 records pair with their state by stem; bad JSON or a stem that differs from date and slug is invalid", () => {
    const { posts, invalid } = parsePostFiles(RECORDS, STATES);
    expect(posts.map((p) => p.stem).sort()).toEqual(["2030-01-02-old-post", "2030-01-09-new-post"]);
    expect(posts.find((p) => p.stem === "2030-01-02-old-post")?.state).not.toBeNull();
    expect(posts.find((p) => p.stem === "2030-01-09-new-post")?.state).toBeNull();
    expect(invalid).toEqual([
      "posts/2030/2030-01-05-mismatch.json",
      "posts/2030/2030-01-07-broken.json",
    ]);
  });

  it("ADM-21 a state file that fails its schema is invalid; files outside YYYY/<stem>.json are ignored", () => {
    const { invalid } = parsePostFiles(
      [],
      [
        { name: "tokens.json", text: "{}" },
        { name: "2030/2030-01-02-old-post.json", text: state({ instagram: { status: "lost" } }) },
      ],
    );
    expect(invalid).toEqual(["posts-state/2030/2030-01-02-old-post.json"]);
  });
});

describe("posts view (ADM-21)", () => {
  const { posts, invalid } = parsePostFiles(RECORDS, STATES);
  const view = buildPosts(posts, invalid);

  it("ADM-21 one row per post, newest first, YouTube title and São Paulo date", () => {
    expect(view.rows.map((r) => r.title)).toEqual(["New post title", "Old post title"]);
    expect(view.rows[0]?.when).toBe("Wed, Jan 9, 19:00");
    expect(formatWhen("2026-11-29", "19:00")).toBe("Sun, Nov 29, 19:00");
  });

  it("ADM-21 effective status per network; link only when published; HTTP status only when failed; unplanned network hidden", () => {
    const old = view.rows[1];
    expect(old?.platforms.map((c) => [c.name, c.word, c.url, c.httpNote])).toEqual([
      ["Instagram", "Published", "https://example.test/p/fixture1", null],
      ["YouTube", "Failed", null, "HTTP 403"],
    ]);
    const fresh = view.rows[0];
    expect(fresh?.platforms.map((c) => c.word)).toEqual(["Scheduled", "Scheduled"]);
    expect(view.headline).toBe("2 posts: 1 of 4 network posts are live");
    expect(view.invalid).toHaveLength(2);
  });

  it("ADM-21 only an https address becomes a link", () => {
    expect(safeUrl("https://example.test/p/1")).toBe("https://example.test/p/1");
    expect(safeUrl("javascript:alert(1)")).toBeNull();
    expect(safeUrl("http://example.test/p/1")).toBeNull();
    expect(safeUrl("not a url")).toBeNull();
    expect(safeUrl("https://user:pw@example.test/p/1")).toBeNull();
    expect(safeUrl(null)).toBeNull();
  });

  it("ADM-21 no posts: the empty sentence", () => {
    expect(buildPosts([]).headline).toBe("No posts yet.");
  });
});

describe("posts loading (ADM-21, ADM-08)", () => {
  const listing = (dir: string) =>
    dir === "posts/"
      ? RECORDS.map((f, i) => ({ name: f.name, sha: SHA(i + 1) }))
      : [
          { name: "tokens.json", sha: SHA(90) },
          ...STATES.map((f, i) => ({ name: f.name, sha: SHA(i + 50) })),
        ];
  const textBySha = new Map<string, string>([
    ...RECORDS.map((f, i) => [SHA(i + 1), f.text] as [string, string]),
    ...STATES.map((f, i) => [SHA(i + 50), f.text] as [string, string]),
  ]);

  it("ADM-08 without a token: unavailable, and GitHub is never called", async () => {
    const list = vi.fn();
    expect(await loadPosts({ token: null, list })).toEqual({
      status: "unavailable",
      httpStatus: null,
    });
    expect(list).not.toHaveBeenCalled();
  });

  it("ADM-21 ADM-08 PST-26 reads both folders read-only with the ledger token, skips tokens.json, and keeps the token out of the result", async () => {
    const read = vi.fn(async (_t: string, sha: string) => ({
      ok: true as const,
      value: textBySha.get(sha) ?? null,
    }));
    const result = await loadPosts({
      token: TOKEN,
      list: async (_t, dir) => ({ ok: true, value: { files: listing(dir), invalid: [] } }),
      read,
    });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.posts).toHaveLength(2);
    expect(read.mock.calls.map((c) => c[1])).not.toContain(SHA(90));
    expect(JSON.stringify(result)).not.toContain(TOKEN);
  });

  it("ADM-08 a listing failure is unavailable with the HTTP status only", async () => {
    expect(
      await loadPosts({ token: TOKEN, list: async () => ({ ok: false, status: 502 }) }),
    ).toEqual({ status: "unavailable", httpStatus: 502 });
  });

  it("ADM-21 an unreadable file is listed as invalid; the other posts still show", async () => {
    const result = await loadPosts({
      token: TOKEN,
      list: async (_t, dir) => ({ ok: true, value: { files: listing(dir), invalid: [] } }),
      read: async (_t, sha) =>
        sha === SHA(50)
          ? { ok: false, status: 404 }
          : { ok: true, value: textBySha.get(sha) ?? null },
    });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.invalid).toContain("posts-state/2030/2030-01-02-old-post.json");
    const old = result.posts.find((p) => p.stem === "2030-01-02-old-post");
    expect(old?.stateInvalid).toBe(true);
    // A broken state never makes a live post look "Scheduled".
    const row = buildPosts(result.posts).rows.find((r) => r.stem === "2030-01-02-old-post");
    expect(row?.platforms.map((c) => [c.name, c.word, c.url])).toEqual([
      ["Instagram", "Status unknown", null],
      ["YouTube", "Status unknown", null],
    ]);
  });
});
