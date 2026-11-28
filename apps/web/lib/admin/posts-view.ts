/**
 * ADM-21 Posts: one row per post (the same video goes to several networks), newest first. Per
 * network: the effective status (PST-07) as a word, and the link to the live post when it is
 * published. Pure: no I/O, so it is unit-tested with invented records.
 */
import {
  type EffectiveStatus,
  effectiveStatus,
  POST_PLATFORMS,
  type PostPlatform,
} from "@careeros/shared";
import type { PostEntry } from "./posts";

export const PLATFORM_NAME: Record<PostPlatform, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  linkedin: "LinkedIn",
};

/** ADM-21: every status is a word (never colour alone). */
export const STATUS_WORD: Record<EffectiveStatus, string> = {
  draft: "Draft",
  ready: "Scheduled",
  queued: "Publishing",
  published: "Published",
  failed: "Failed",
  skipped: "Skipped",
};

export interface PostPlatformCell {
  platform: PostPlatform;
  name: string;
  status: EffectiveStatus;
  word: string;
  /** Link to the live post: only when published and the URL is an https address. */
  url: string | null;
  /** "HTTP 400" for a failed post (PST-20: the HTTP status only), else null. */
  httpNote: string | null;
  /** ISO time the post went live, for the Details table. */
  publishedAt: string | null;
}

export interface PostRow {
  stem: string;
  /** "Sun, Nov 29, 19:00" (the record's date and time, São Paulo). */
  when: string;
  title: string;
  pillar: string;
  platforms: PostPlatformCell[];
}

export interface PostsView {
  headline: string;
  rows: PostRow[];
  invalid: string[];
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-11-29" + "19:00" -> "Sun, Nov 29, 19:00". The date is a calendar day: no time zone math. */
export function formatWhen(date: string, time: string): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const day = new Date(Date.UTC(y, m - 1, d));
  return `${WEEKDAYS[day.getUTCDay()]}, ${MONTHS[m - 1]} ${d}, ${time}`;
}

/** Only a plain https address becomes a link (no `javascript:` or other schemes). */
export function safeUrl(url: string | null): string | null {
  if (url === null) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

function cells(entry: PostEntry): PostPlatformCell[] {
  const out: PostPlatformCell[] = [];
  for (const platform of POST_PLATFORMS) {
    const status = effectiveStatus(entry.record, entry.state, platform);
    if (status === null) continue;
    const fromState = entry.state?.platforms[platform];
    // A network the record skipped and the pipeline never touched was not planned: not shown.
    if (status === "skipped" && fromState === undefined) continue;
    const http = fromState?.error?.http_status ?? null;
    out.push({
      platform,
      name: PLATFORM_NAME[platform],
      status,
      word: STATUS_WORD[status],
      url: status === "published" ? safeUrl(fromState?.url ?? null) : null,
      httpNote: status === "failed" && http !== null ? `HTTP ${http}` : null,
      publishedAt: status === "published" ? (fromState?.published_at ?? null) : null,
    });
  }
  return out;
}

export function buildPosts(
  posts: readonly PostEntry[],
  invalid: readonly string[] = [],
): PostsView {
  const rows = [...posts]
    .sort((a, b) => {
      const ka = `${a.record.date} ${a.record.time}`;
      const kb = `${b.record.date} ${b.record.time}`;
      return ka === kb ? b.stem.localeCompare(a.stem) : kb.localeCompare(ka);
    })
    .map((entry) => ({
      stem: entry.stem,
      when: formatWhen(entry.record.date, entry.record.time),
      title: entry.record.platforms.youtube?.title || entry.record.slug,
      pillar: entry.record.pillar,
      platforms: cells(entry),
    }));
  const all = rows.flatMap((r) => r.platforms);
  const published = all.filter((c) => c.status === "published").length;
  const headline =
    rows.length === 0
      ? "No posts yet."
      : `${rows.length} ${rows.length === 1 ? "post" : "posts"}: ${published} of ${all.length} network ${all.length === 1 ? "post is" : "posts are"} live`;
  return { headline, rows, invalid: [...invalid] };
}
