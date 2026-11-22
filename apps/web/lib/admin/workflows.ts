/**
 * ADM-18: GitHub REST reads of the last completed run of six workflows of the PUBLIC repository,
 * from the server only, with the same token as the ledger (ADM-08). Read-only GET requests, each
 * cached `GITHUB_CACHE_S`. A 403 with the token falls back to the same read without it (ADM-16).
 * Only `status`, `conclusion` and `updated_at` are kept (ADM-07). One failing workflow fails its
 * own row only (ADM-17). The token goes into the `Authorization` header only: never logged,
 * never returned.
 */
import "server-only";
import { z } from "zod";
import { githubApiBase, opsLedgerToken } from "@/lib/env";
import { GITHUB_API, GITHUB_CACHE_S, PUBLIC_REPO } from "./config";
import type { CachedRequestInit, GithubRequest } from "./github";
import { githubHeaders } from "./github";
import {
  BACKUP_FILE,
  type HealthInput,
  WORKFLOWS,
  type WorkflowResult,
  type WorkflowRun,
} from "./health-view";

type RunStatus = "completed" | "success";

/** The newest run with this `status` filter on `main` (`success` is a conclusion filter). */
export function runsRequest(token: string | null, file: string, status: RunStatus): GithubRequest {
  const headers =
    token === null
      ? { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" }
      : githubHeaders(token, "application/vnd.github+json");
  return {
    url: `${githubApiBase(GITHUB_API)}/repos/${PUBLIC_REPO}/actions/workflows/${file}/runs?branch=main&status=${status}&per_page=1`,
    init: {
      headers,
      cache: "force-cache",
      next: { revalidate: GITHUB_CACHE_S, tags: ["workflow-runs"] },
    },
  };
}

const RunsSchema = z.object({
  workflow_runs: z.array(
    z.object({
      status: z.string(),
      conclusion: z.string().nullable(),
      updated_at: z.iso.datetime(),
    }),
  ),
});

type Fetcher = (url: string, init: CachedRequestInit) => Promise<Response>;
type Read = { ok: true; run: WorkflowRun | null } | { ok: false; httpStatus: number | null };

async function readOnce(
  token: string | null,
  file: string,
  status: RunStatus,
  fetcher: Fetcher,
): Promise<Read> {
  const { url, init } = runsRequest(token, file, status);
  try {
    const res = await fetcher(url, init);
    if (!res.ok) return { ok: false, httpStatus: res.status };
    const parsed = RunsSchema.safeParse(await res.json().catch(() => null));
    if (!parsed.success) return { ok: false, httpStatus: null };
    const first = parsed.data.workflow_runs[0];
    return {
      ok: true,
      run: first
        ? { status: first.status, conclusion: first.conclusion, updatedAt: first.updated_at }
        : null,
    };
  } catch {
    return { ok: false, httpStatus: null };
  }
}

/** With the token; on 403 once more without it (ADM-08, ADM-16). */
export async function readRun(
  token: string,
  file: string,
  status: RunStatus,
  fetcher: Fetcher = fetch,
): Promise<Read> {
  const first = await readOnce(token, file, status, fetcher);
  if (first.ok || first.httpStatus !== 403) return first;
  return readOnce(null, file, status, fetcher);
}

interface Deps {
  token?: string | null;
  fetcher?: Fetcher;
}

export type WorkflowsLoad = { status: "ok"; inputs: HealthInput[] } | { status: "unavailable" };

/** Seven requests: the six newest completed runs, and the backup's newest successful run. */
export async function loadWorkflows(deps: Deps = {}): Promise<WorkflowsLoad> {
  const token = deps.token === undefined ? opsLedgerToken() : deps.token;
  if (!token) return { status: "unavailable" };
  const fetcher = deps.fetcher ?? fetch;
  const inputs = await Promise.all(
    WORKFLOWS.map(async ({ file }): Promise<HealthInput> => {
      const [latest, good] = await Promise.all([
        readRun(token, file, "completed", fetcher),
        file === BACKUP_FILE ? readRun(token, file, "success", fetcher) : Promise.resolve(null),
      ]);
      const result: WorkflowResult = latest.ok
        ? { ok: true, run: latest.run, ...(good?.ok ? { lastGood: good.run } : {}) }
        : latest;
      return { file, result };
    }),
  );
  return { status: "ok", inputs };
}
