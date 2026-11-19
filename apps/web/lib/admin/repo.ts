/**
 * ADM-12: GitHub REST reads of the PUBLIC repository's issues, pull requests and check runs, from
 * the server only, with the same token as the ledger (ADR-0013: it reads public repositories too;
 * the endpoints below only return public data, so the token needs no permission beyond the
 * read-only Contents access it already has). Read-only GET requests. Each listing is cached
 * `GITHUB_CACHE_S`. The token goes into the `Authorization` header only: never logged, never
 * returned.
 */
import "server-only";
import { z } from "zod";
import { opsLedgerToken } from "@/lib/env";
import { GITHUB_API, GITHUB_CACHE_S, PUBLIC_REPO } from "./config";
import { type CachedRequestInit, type GithubRequest, githubHeaders } from "./github";
import {
  type CheckRun,
  closedIssues,
  isReviewCandidate,
  type RepoIssue,
  type RepoPr,
} from "./progress-view";

const PAGE_SIZE = 100;
/** Pages read per listing: 500 items, far above the v1 backlog; more is cut and not shown. */
export const MAX_PAGES = 5;

const get = (token: string, path: string, tag: string): GithubRequest => ({
  url: `${GITHUB_API}/repos/${PUBLIC_REPO}/${path}`,
  init: {
    headers: githubHeaders(token, "application/vnd.github+json"),
    cache: "force-cache",
    next: { revalidate: GITHUB_CACHE_S, tags: [tag] },
  },
});

export const issuesRequest = (token: string, page: number) =>
  get(token, `issues?labels=v1&state=all&per_page=${PAGE_SIZE}&page=${page}`, "repo-issues");

export const pullsRequest = (token: string, page: number) =>
  get(
    token,
    `pulls?state=all&sort=updated&direction=desc&per_page=${PAGE_SIZE}&page=${page}`,
    "repo-pulls",
  );

export const checkRunsRequest = (token: string, sha: string) =>
  get(token, `commits/${sha}/check-runs?per_page=${PAGE_SIZE}`, "repo-checks");

const IssuesSchema = z.array(
  z.object({
    number: z.number().int(),
    title: z.string(),
    state: z.enum(["open", "closed"]),
    labels: z.array(z.union([z.string(), z.object({ name: z.string() })])),
    pull_request: z.unknown().optional(),
  }),
);

const PullsSchema = z.array(
  z.object({
    number: z.number().int(),
    state: z.enum(["open", "closed"]),
    draft: z.boolean().optional(),
    merged_at: z.string().nullable().optional(),
    body: z.string().nullable().optional(),
    head: z.object({ sha: z.string().regex(/^[0-9a-f]{40}$/) }),
  }),
);

const ChecksSchema = z.object({
  check_runs: z.array(z.object({ name: z.string(), conclusion: z.string().nullable() })),
});

export type RepoLoad =
  | {
      status: "ok";
      issues: RepoIssue[];
      prs: RepoPr[];
      checks: Record<string, CheckRun[]>;
    }
  | { status: "unavailable"; httpStatus: number | null; reason?: "unreadable" };

type Fetcher = (url: string, init: CachedRequestInit) => Promise<Response>;
type Fail = { ok: false; httpStatus: number | null; reason?: "unreadable" };

/** Reads one page after another until a short page or `MAX_PAGES`. */
async function readPages<T>(
  request: (page: number) => GithubRequest,
  schema: z.ZodType<T[]>,
  fetcher: Fetcher,
): Promise<{ ok: true; items: T[] } | Fail> {
  const items: T[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { url, init } = request(page);
    let res: Response;
    try {
      res = await fetcher(url, init);
    } catch {
      return { ok: false, httpStatus: null };
    }
    if (!res.ok) return { ok: false, httpStatus: res.status };
    const parsed = schema.safeParse(await res.json().catch(() => null));
    if (!parsed.success) return { ok: false, httpStatus: null, reason: "unreadable" };
    items.push(...parsed.data);
    if (parsed.data.length < PAGE_SIZE) break;
  }
  return { ok: true, items };
}

interface Deps {
  token?: string | null;
  fetcher?: Fetcher;
}

export async function loadRepo(deps: Deps = {}): Promise<RepoLoad> {
  const token = deps.token === undefined ? opsLedgerToken() : deps.token;
  if (!token) return { status: "unavailable", httpStatus: null };
  const fetcher = deps.fetcher ?? fetch;

  const [issueRes, pullRes] = await Promise.all([
    readPages((p) => issuesRequest(token, p), IssuesSchema, fetcher),
    readPages((p) => pullsRequest(token, p), PullsSchema, fetcher),
  ]);
  const failed = [issueRes, pullRes].find((r) => !r.ok);
  if (failed && !failed.ok) {
    return {
      status: "unavailable",
      httpStatus: failed.httpStatus,
      ...(failed.reason ? { reason: failed.reason } : {}),
    };
  }
  if (!issueRes.ok || !pullRes.ok) return { status: "unavailable", httpStatus: null };

  // The issues endpoint also lists pull requests; they are not v1 issues.
  const issues: RepoIssue[] = issueRes.items
    .filter((i) => i.pull_request === undefined)
    .map((i) => ({
      number: i.number,
      title: i.title,
      state: i.state,
      labels: i.labels.map((l) => (typeof l === "string" ? l : l.name)),
    }));
  const prs: RepoPr[] = pullRes.items.map((p) => ({
    number: p.number,
    state: p.state,
    draft: p.draft ?? false,
    merged: p.merged_at != null,
    body: p.body ?? "",
    headSha: p.head.sha,
  }));

  // Check runs are read only for open, non-draft PRs that close an open v1 issue.
  const openV1 = new Set(issues.filter((i) => i.state === "open").map((i) => i.number));
  const candidates = prs.filter(
    (p) => isReviewCandidate(p) && closedIssues(p.body).some((n) => openV1.has(n)),
  );
  const checks: Record<string, CheckRun[]> = {};
  const runs = await Promise.all(
    candidates.map(async (pr) => ({
      sha: pr.headSha,
      res: await readChecks(token, pr.headSha, fetcher),
    })),
  );
  for (const { sha, res } of runs) {
    if (!res.ok) {
      return {
        status: "unavailable",
        httpStatus: res.httpStatus,
        ...(res.reason ? { reason: res.reason } : {}),
      };
    }
    checks[sha] = res.runs;
  }
  return { status: "ok", issues, prs, checks };
}

async function readChecks(
  token: string,
  sha: string,
  fetcher: Fetcher,
): Promise<{ ok: true; runs: CheckRun[] } | Fail> {
  const { url, init } = checkRunsRequest(token, sha);
  try {
    const res = await fetcher(url, init);
    if (!res.ok) return { ok: false, httpStatus: res.status };
    const parsed = ChecksSchema.safeParse(await res.json().catch(() => null));
    if (!parsed.success) return { ok: false, httpStatus: null, reason: "unreadable" };
    return { ok: true, runs: parsed.data.check_runs };
  } catch {
    return { ok: false, httpStatus: null };
  }
}
