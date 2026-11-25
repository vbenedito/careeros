/**
 * PST-24, PST-25: alerts, reminders and warnings are GitHub issues. One open issue per stem,
 * platform and kind: a rerun updates it. The body holds only post text, times, the next step;
 * never a token, a signed URL or an API response body.
 */
import {
  type PostPlatform,
  type PostRecord,
  recordStem,
  slotInstant,
} from "../../packages/shared/src/posts.ts";
import type { GitHubApi, IssueInfo } from "./github.ts";

export type IssueKind =
  | "post-alert"
  | "post-reminder"
  | "token-expiry"
  | "post-metrics"
  | "ops-security";

const KIND_TITLE: Record<IssueKind, string> = {
  "post-alert": "Post alert",
  "post-reminder": "Post reminder",
  "token-expiry": "Token expiry",
  "post-metrics": "Post metrics",
  "ops-security": "Ops security",
};

export const issueTitle = (kind: IssueKind, stem: string, platform: PostPlatform | "all"): string =>
  `${KIND_TITLE[kind]}: ${stem} (${platform})`;

/** "Tue 2026-12-01 19:00 São Paulo (22:00 UTC)". */
export function describeSlot(record: Pick<PostRecord, "date" | "time" | "timezone">): string {
  const instant = slotInstant(record.date, record.time, record.timezone);
  const day = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(
    new Date(`${record.date}T12:00:00Z`),
  );
  const utc = instant.toISOString().slice(11, 16);
  return `${day} ${record.date} ${record.time} São Paulo (${utc} UTC)`;
}

/** The issue for this stem, platform and kind, or null. */
export async function findOpenIssue(
  gh: GitHubApi,
  kind: IssueKind,
  stem: string,
  platform: PostPlatform | "all",
): Promise<IssueInfo | null> {
  const title = issueTitle(kind, stem, platform);
  const issues = await gh.listOpenIssues();
  return issues.find((i) => i.title === title && i.labels.includes(kind)) ?? null;
}

/** Creates the issue or updates the open one; returns its number. */
export async function upsertIssue(
  gh: GitHubApi,
  input: { kind: IssueKind; stem: string; platform: PostPlatform | "all"; body: string },
): Promise<number> {
  const existing = await findOpenIssue(gh, input.kind, input.stem, input.platform);
  if (existing) {
    if (existing.body !== input.body) await gh.updateIssue(existing.number, { body: input.body });
    return existing.number;
  }
  const created = await gh.createIssue({
    title: issueTitle(input.kind, input.stem, input.platform),
    body: input.body,
    labels: [input.kind],
  });
  return created.number;
}

export interface AlertBody {
  record: Pick<PostRecord, "date" | "time" | "timezone" | "slug">;
  platform: PostPlatform | "all";
  what: string;
  httpStatus?: number | null;
  code?: string | null;
  attempts?: number;
  maxAttempts?: number;
  next: string;
  /** Texts to copy when the post has to be made by hand. */
  texts?: string;
}

/** Plain, fixed text: no response body, no URL, no token. */
export function alertBody(input: AlertBody): string {
  const lines = [
    `Post: ${input.record.date}-${input.record.slug}`,
    `Platform: ${input.platform}`,
    `Time: ${describeSlot(input.record)}`,
    `What happened: ${input.what}`,
  ];
  if (input.httpStatus !== undefined || input.code !== undefined) {
    lines.push(`HTTP status: ${input.httpStatus ?? "none"}, error code: ${input.code ?? "none"}`);
  }
  if (input.attempts !== undefined) {
    lines.push(`Attempts: ${input.attempts} of ${input.maxAttempts ?? 3}`);
  }
  lines.push(`Next step: ${input.next}`);
  if (input.texts) lines.push("", "Texts:", input.texts);
  return lines.join("\n");
}

export const stemOf = recordStem;
