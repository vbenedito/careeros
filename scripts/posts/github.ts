/**
 * PST-02, PST-10, PST-24: a small GitHub REST client for the ops repository. The token comes from
 * the caller (env `GH_TOKEN`) and is only ever sent in the `Authorization` header. Base URL and
 * fetch are injected, so tests run without a network.
 */
import {
  ApiError,
  type FetchLike,
  readErrorCode,
  timeoutSignal,
  UPLOAD_TIMEOUT_MS,
} from "./mask.ts";

export interface CommitInfo {
  sha: string;
  message: string;
}
export interface PullInfo {
  number: number;
  state: string;
  merged_at: string | null;
  merge_commit_sha: string | null;
  merged_by: { login: string } | null;
  head_sha: string;
  head_ref: string;
  base_ref: string;
  created_at: string;
  title: string;
  labels: string[];
}
export interface IssueInfo {
  number: number;
  title: string;
  state: string;
  labels: string[];
  body: string;
}
export interface RunInfo {
  id: number;
  path: string;
  head_branch: string | null;
  event: string;
  display_title: string;
}
export interface WorkflowRun {
  id: number;
  status: string;
  conclusion: string | null;
  created_at: string;
}
export interface BranchInfo {
  name: string;
  sha: string;
}
export interface StatusInfo {
  context: string;
  state: string;
  created_at: string;
}
export interface CommentInfo {
  id: number;
  body: string;
  login: string;
  created_at: string;
}
export interface PullFile {
  filename: string;
  status: string;
}
export interface ReleaseAsset {
  id: number;
  name: string;
}

/** What the pipeline needs from GitHub; tests implement it in memory. */
export interface GitHubApi {
  readonly repo: string;
  lastCommitOfFile(path: string, branch: string): Promise<CommitInfo | null>;
  pullsOfCommit(sha: string): Promise<PullInfo[]>;
  getPull(number: number): Promise<PullInfo>;
  listOpenPulls(): Promise<PullInfo[]>;
  listPullFiles(number: number): Promise<PullFile[]>;
  getFileText(path: string, ref: string): Promise<string | null>;
  listStatuses(sha: string): Promise<StatusInfo[]>;
  listComments(number: number): Promise<CommentInfo[]>;
  createComment(number: number, body: string): Promise<void>;
  mergePull(number: number, input: { sha: string; title: string; message: string }): Promise<void>;
  listOpenIssues(): Promise<IssueInfo[]>;
  createIssue(input: { title: string; body: string; labels: string[] }): Promise<IssueInfo>;
  updateIssue(
    number: number,
    input: { title?: string; body?: string; state?: "open" | "closed" },
  ): Promise<void>;
  removeLabel(number: number, label: string): Promise<void>;
  findReleaseAsset(tag: string, name: string): Promise<ReleaseAsset | null>;
  /** The short-lived signed download URL (the redirect `Location`). The caller masks it. */
  assetSignedUrl(assetId: number): Promise<string>;
  /** The bytes of an asset, fetched from the signed URL without the GitHub token. */
  assetBytes(assetId: number, mask: (value: string) => string): Promise<Uint8Array>;
  getRun(id: number): Promise<RunInfo>;
  /** An issue (open or closed) with exactly this title and label, for "once ever" alerts (PST-23). */
  findIssueByTitle(title: string, label: string): Promise<IssueInfo | null>;
  /** The blob SHA of a file at a ref, or null when it does not exist (PST-33). */
  fileSha(path: string, ref: string): Promise<string | null>;
  listBranches(): Promise<BranchInfo[]>;
  /** Files that `head` changes compared with `base` (three-dot compare). */
  compareFiles(base: string, head: string): Promise<string[]>;
  /** Commits on `branch` that touch `path`, since an ISO time (PST-33). */
  listCommitsOfPath(path: string, branch: string, since: string): Promise<string[]>;
  commitFiles(sha: string): Promise<string[]>;
  /** The newest runs of one workflow file (PST-11). */
  listWorkflowRuns(file: string): Promise<WorkflowRun[]>;
}

export interface GitHubOptions {
  repo: string;
  token: string;
  fetch: FetchLike;
  baseUrl?: string;
}

type Json = Record<string, unknown>;
const asJson = (value: unknown): Json =>
  value && typeof value === "object" ? (value as Json) : {};
const str = (value: unknown, fallback = ""): string =>
  typeof value === "string" ? value : fallback;
const labelNames = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.map((l) => (typeof l === "string" ? l : str(asJson(l).name))).filter((n) => n !== "")
    : [];

function toPull(raw: unknown): PullInfo {
  const p = asJson(raw);
  const by = asJson(p.merged_by);
  return {
    number: Number(p.number),
    state: str(p.state),
    merged_at: typeof p.merged_at === "string" ? p.merged_at : null,
    merge_commit_sha: typeof p.merge_commit_sha === "string" ? p.merge_commit_sha : null,
    merged_by: typeof by.login === "string" ? { login: by.login } : null,
    head_sha: str(asJson(p.head).sha),
    head_ref: str(asJson(p.head).ref),
    base_ref: str(asJson(p.base).ref),
    created_at: str(p.created_at),
    title: str(p.title),
    labels: labelNames(p.labels),
  };
}
function toIssue(raw: unknown): IssueInfo {
  const i = asJson(raw);
  return {
    number: Number(i.number),
    title: str(i.title),
    state: str(i.state),
    labels: labelNames(i.labels),
    body: str(i.body),
  };
}

export class GitHubClient implements GitHubApi {
  readonly repo: string;
  readonly #token: string;
  readonly #fetch: FetchLike;
  readonly #base: string;

  constructor(options: GitHubOptions) {
    if (!/^[\w.-]+\/[\w.-]+$/.test(options.repo)) throw new Error("repo must be owner/name");
    if (options.token === "") throw new Error("GH_TOKEN is not set");
    this.repo = options.repo;
    this.#token = options.token;
    this.#fetch = options.fetch;
    this.#base = (options.baseUrl ?? "https://api.github.com").replace(/\/$/, "");
  }

  #headers(accept = "application/vnd.github+json"): Record<string, string> {
    return {
      Authorization: `Bearer ${this.#token}`,
      Accept: accept,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "careeros-posts",
    };
  }

  async #request(
    method: string,
    path: string,
    body?: unknown,
    accept?: string,
    redirect?: "manual" | "follow" | "error",
  ): Promise<Response> {
    const init: RequestInit = { method, headers: this.#headers(accept), signal: timeoutSignal() };
    if (redirect) init.redirect = redirect;
    if (body !== undefined) {
      init.body = JSON.stringify(body);
      init.headers = { ...this.#headers(accept), "Content-Type": "application/json" };
    }
    return this.#fetch(`${this.#base}/repos/${this.repo}${path}`, init);
  }

  async #json(method: string, path: string, body?: unknown, allow404 = false): Promise<unknown> {
    const response = await this.#request(method, path, body);
    if (allow404 && response.status === 404) return null;
    if (!response.ok) throw new ApiError("GitHub", response.status, await readErrorCode(response));
    return response.status === 204 ? null : response.json();
  }

  async lastCommitOfFile(path: string, branch: string): Promise<CommitInfo | null> {
    const query = new URLSearchParams({ path, sha: branch, per_page: "1" });
    const list = await this.#json("GET", `/commits?${query}`);
    const first = Array.isArray(list) ? asJson(list[0]) : {};
    if (typeof first.sha !== "string") return null;
    return { sha: first.sha, message: str(asJson(first.commit).message) };
  }

  async pullsOfCommit(sha: string): Promise<PullInfo[]> {
    const list = await this.#json("GET", `/commits/${encodeURIComponent(sha)}/pulls?per_page=100`);
    return Array.isArray(list) ? list.map(toPull) : [];
  }

  async getPull(number: number): Promise<PullInfo> {
    return toPull(await this.#json("GET", `/pulls/${number}`));
  }

  async listOpenPulls(): Promise<PullInfo[]> {
    const list = await this.#json("GET", "/pulls?state=open&per_page=100");
    return Array.isArray(list) ? list.map(toPull) : [];
  }

  async listPullFiles(number: number): Promise<PullFile[]> {
    const list = await this.#json("GET", `/pulls/${number}/files?per_page=100`);
    return Array.isArray(list)
      ? list.map((f) => ({ filename: str(asJson(f).filename), status: str(asJson(f).status) }))
      : [];
  }

  async getFileText(path: string, ref: string): Promise<string | null> {
    const query = new URLSearchParams({ ref });
    const response = await this.#request(
      "GET",
      `/contents/${path}?${query}`,
      undefined,
      "application/vnd.github.raw+json",
    );
    if (response.status === 404) return null;
    if (!response.ok) throw new ApiError("GitHub", response.status, await readErrorCode(response));
    return response.text();
  }

  async listStatuses(sha: string): Promise<StatusInfo[]> {
    const list = await this.#json(
      "GET",
      `/commits/${encodeURIComponent(sha)}/statuses?per_page=100`,
    );
    return Array.isArray(list)
      ? list.map((s) => ({
          context: str(asJson(s).context),
          state: str(asJson(s).state),
          created_at: str(asJson(s).created_at),
        }))
      : [];
  }

  async listComments(number: number): Promise<CommentInfo[]> {
    const list = await this.#json("GET", `/issues/${number}/comments?per_page=100`);
    return Array.isArray(list)
      ? list.map((c) => ({
          id: Number(asJson(c).id),
          body: str(asJson(c).body),
          login: str(asJson(asJson(c).user).login),
          created_at: str(asJson(c).created_at),
        }))
      : [];
  }

  async createComment(number: number, body: string): Promise<void> {
    await this.#json("POST", `/issues/${number}/comments`, { body });
  }

  async mergePull(
    number: number,
    input: { sha: string; title: string; message: string },
  ): Promise<void> {
    await this.#json("PUT", `/pulls/${number}/merge`, {
      sha: input.sha,
      merge_method: "squash",
      commit_title: input.title,
      commit_message: input.message,
    });
  }

  async listOpenIssues(): Promise<IssueInfo[]> {
    const all: IssueInfo[] = [];
    for (let page = 1; page <= 5; page++) {
      const list = await this.#json("GET", `/issues?state=open&per_page=100&page=${page}`);
      if (!Array.isArray(list)) break;
      // The issues endpoint also lists pull requests; they carry a `pull_request` key.
      for (const raw of list) if (!("pull_request" in asJson(raw))) all.push(toIssue(raw));
      if (list.length < 100) break;
    }
    return all;
  }

  async createIssue(input: { title: string; body: string; labels: string[] }): Promise<IssueInfo> {
    return toIssue(await this.#json("POST", "/issues", input));
  }

  async updateIssue(
    number: number,
    input: { title?: string; body?: string; state?: "open" | "closed" },
  ): Promise<void> {
    await this.#json("PATCH", `/issues/${number}`, input);
  }

  async removeLabel(number: number, label: string): Promise<void> {
    await this.#json(
      "DELETE",
      `/issues/${number}/labels/${encodeURIComponent(label)}`,
      undefined,
      true,
    );
  }

  async findReleaseAsset(tag: string, name: string): Promise<ReleaseAsset | null> {
    const release = asJson(
      await this.#json("GET", `/releases/tags/${encodeURIComponent(tag)}`, undefined, true),
    );
    const assets = Array.isArray(release.assets) ? release.assets : [];
    for (const raw of assets) {
      const a = asJson(raw);
      if (a.name === name && typeof a.id === "number") return { id: a.id, name };
    }
    return null;
  }

  async assetSignedUrl(assetId: number): Promise<string> {
    // `redirect: "manual"` keeps the signed URL out of a followed request: only the header is read.
    const response = await this.#request(
      "GET",
      `/releases/assets/${assetId}`,
      undefined,
      "application/octet-stream",
      "manual",
    );
    return this.#locationOf(response);
  }

  async #locationOf(response: Response): Promise<string> {
    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) return location;
    throw new ApiError("GitHub", response.status, await readErrorCode(response));
  }

  async assetBytes(assetId: number, mask: (value: string) => string): Promise<Uint8Array> {
    const url = mask(await this.assetSignedUrl(assetId));
    // The signed URL carries its own authorization: the GitHub token is not sent to that host.
    const response = await this.#fetch(url, {
      method: "GET",
      signal: timeoutSignal(UPLOAD_TIMEOUT_MS),
    });
    if (!response.ok) throw new ApiError("GitHub", response.status, null);
    return new Uint8Array(await response.arrayBuffer());
  }

  async getRun(id: number): Promise<RunInfo> {
    const r = asJson(await this.#json("GET", `/actions/runs/${id}`));
    return {
      id: Number(r.id),
      path: str(r.path),
      head_branch: typeof r.head_branch === "string" ? r.head_branch : null,
      event: str(r.event),
      display_title: str(r.display_title),
    };
  }

  async findIssueByTitle(title: string, label: string): Promise<IssueInfo | null> {
    const clean = (v: string): string => v.replace(/["\\]/g, " ");
    const q = `repo:${this.repo} is:issue label:"${clean(label)}" in:title "${clean(title)}"`;
    const response = await this.#fetch(
      `${this.#base}/search/issues?${new URLSearchParams({ q, per_page: "30" })}`,
      { method: "GET", headers: this.#headers(), signal: timeoutSignal() },
    );
    if (!response.ok) throw new ApiError("GitHub", response.status, await readErrorCode(response));
    const body = asJson(await response.json());
    const items = Array.isArray(body.items) ? body.items : [];
    const found = items.map(toIssue).find((i) => i.title === title && i.labels.includes(label));
    return found ?? null;
  }

  async fileSha(path: string, ref: string): Promise<string | null> {
    const query = new URLSearchParams({ ref });
    const response = await this.#request("GET", `/contents/${path}?${query}`);
    if (response.status === 404) return null;
    if (!response.ok) throw new ApiError("GitHub", response.status, await readErrorCode(response));
    const body = asJson(await response.json());
    return typeof body.sha === "string" ? body.sha : null;
  }

  async listBranches(): Promise<BranchInfo[]> {
    const all: BranchInfo[] = [];
    for (let page = 1; page <= 10; page++) {
      const list = await this.#json("GET", `/branches?per_page=100&page=${page}`);
      if (!Array.isArray(list)) break;
      for (const b of list) {
        all.push({ name: str(asJson(b).name), sha: str(asJson(asJson(b).commit).sha) });
      }
      if (list.length < 100) break;
    }
    return all;
  }

  async compareFiles(base: string, head: string): Promise<string[]> {
    const spec = `${encodeURIComponent(base)}...${encodeURIComponent(head)}`;
    const body = asJson(await this.#json("GET", `/compare/${spec}?per_page=100`));
    return Array.isArray(body.files) ? body.files.map((f) => str(asJson(f).filename)) : [];
  }

  async listCommitsOfPath(path: string, branch: string, since: string): Promise<string[]> {
    const query = new URLSearchParams({ path, sha: branch, since, per_page: "100" });
    const list = await this.#json("GET", `/commits?${query}`);
    return Array.isArray(list) ? list.map((c) => str(asJson(c).sha)).filter((s) => s !== "") : [];
  }

  async commitFiles(sha: string): Promise<string[]> {
    const body = asJson(await this.#json("GET", `/commits/${encodeURIComponent(sha)}`));
    return Array.isArray(body.files) ? body.files.map((f) => str(asJson(f).filename)) : [];
  }

  async listWorkflowRuns(file: string): Promise<WorkflowRun[]> {
    const body = asJson(
      await this.#json("GET", `/actions/workflows/${encodeURIComponent(file)}/runs?per_page=20`),
    );
    const runs = Array.isArray(body.workflow_runs) ? body.workflow_runs : [];
    return runs.map((r) => ({
      id: Number(asJson(r).id),
      status: str(asJson(r).status),
      conclusion:
        typeof asJson(r).conclusion === "string" ? (asJson(r).conclusion as string) : null,
      created_at: str(asJson(r).created_at),
    }));
  }
}
