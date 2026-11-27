/** Test doubles for the posts pipeline: in-memory GitHub, Instagram and YouTube. No network. */
import { createHash } from "node:crypto";
import type { PostRecord } from "../../packages/shared/src/posts.ts";
import type {
  BranchInfo,
  CommentInfo,
  CommitInfo,
  GitHubApi,
  IssueInfo,
  PullFile,
  PullInfo,
  ReleaseAsset,
  RunInfo,
  StatusInfo,
  WorkflowRun,
} from "./github.ts";
import { ContainerFailedError, type ContainerStatus, type InstagramApi } from "./instagram.ts";
import type { YoutubeApi, YoutubeVideoStatus } from "./youtube.ts";

export const SECRETS = {
  igToken: "IGTOKEN-SECRET-123",
  ytAccess: "YT-ACCESS-SECRET-456",
  signedUrl: "https://objects.example.test/asset?X-Amz-Signature=SIGNED-SECRET-789",
  session: "https://upload.example.test/session?upload_id=SESSION-SECRET-abc",
};

export const VIDEO = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
export const VIDEO_SHA = createHash("sha256").update(VIDEO).digest("hex");
export const goodProbe = async () => ({ width: 1080, height: 1920, durationS: 30 });

/** 2026-11-26 is a Thursday; 19:00 Sao Paulo is 22:00 UTC. */
export const SLOT = new Date("2026-11-26T22:00:00Z");
export const at = (minutes: number): Date => new Date(SLOT.getTime() + minutes * 60_000);

export function makeRecord(over: Partial<PostRecord> = {}): PostRecord {
  const entry = {
    status: "ready" as const,
    caption: "Restart after a gap",
    hashtags: ["#careeros", "#leetcode"],
    link: null,
    alt_text: null,
    text_version: "Text version",
  };
  return {
    schema: 1,
    slug: "restart-after-gap",
    date: "2026-11-26",
    time: "19:00",
    timezone: "America/Sao_Paulo",
    pillar: "restart",
    format: "steps",
    video: {
      release: "post-2026-11-26-restart-after-gap",
      asset: "2026-11-26-restart-after-gap.mp4",
      sha256: VIDEO_SHA,
    },
    music_license: "original:careeros_music:7",
    ai_label: false,
    platforms: { instagram: { ...entry }, youtube: { ...entry, title: "Restart" } },
    ...over,
  };
}

export const RECORD_PATH = "posts/2026/2026-11-26-restart-after-gap.json";
export const STEM = "2026-11-26-restart-after-gap";
export const recordFile = (record: PostRecord = makeRecord()) => ({
  path: RECORD_PATH,
  text: JSON.stringify(record),
});

const pull = (over: Partial<PullInfo>): PullInfo => ({
  number: 12,
  state: "closed",
  merged_at: "2026-11-26T20:00:00Z",
  merge_commit_sha: "c".repeat(40),
  merged_by: { login: "github-actions[bot]" },
  head_sha: "h".repeat(40),
  head_ref: "record",
  base_ref: "main",
  created_at: "2026-11-25T10:00:00Z",
  title: "record",
  labels: [],
  ...over,
});

export class FakeGitHub implements GitHubApi {
  readonly repo = "vbenedito/careeros-ops";
  /** Every call that would change something on GitHub. */
  writes: string[] = [];
  commit: CommitInfo | null = {
    sha: "c".repeat(40),
    message: "feat(posts): x (#12)\n\nPosts-Auto-Merge-Run: 555",
  };
  pulls: PullInfo[] = [pull({})];
  openPulls: PullInfo[] = [];
  pullFiles = new Map<number, PullFile[]>();
  issues: IssueInfo[] = [];
  runs = new Map<number, RunInfo>([
    [
      555,
      {
        id: 555,
        path: ".github/workflows/posts-auto-merge.yml",
        head_branch: "main",
        event: "schedule",
        display_title: "posts-auto-merge dry_run=false",
      },
    ],
  ]);
  asset: ReleaseAsset | null = { id: 9, name: "2026-11-26-restart-after-gap.mp4" };
  assetBytesValue: Uint8Array = VIDEO;
  comments: string[] = [];
  removedLabels: string[] = [];
  nextIssue = 100;
  /** Runs before each `getPull`; tests use it to add a label at a chosen moment. */
  onGetPull: (() => void) | null = null;

  async lastCommitOfFile(): Promise<CommitInfo | null> {
    return this.commit;
  }
  /** Per-commit answers of `commits/{sha}/pulls` (trust-check fixtures); others get `pulls`. */
  pullsBySha = new Map<string, PullInfo[]>();
  async pullsOfCommit(sha?: string): Promise<PullInfo[]> {
    return (sha !== undefined ? this.pullsBySha.get(sha) : undefined) ?? this.pulls;
  }
  async getPull(number: number): Promise<PullInfo> {
    this.onGetPull?.();
    const found = this.pulls.find((p) => p.number === number);
    if (!found) throw new Error("no pull");
    return found;
  }
  async listOpenPulls(): Promise<PullInfo[]> {
    return this.openPulls;
  }
  async listPullFiles(number: number): Promise<PullFile[]> {
    return this.pullFiles.get(number) ?? [];
  }
  async getFileText(): Promise<string | null> {
    return null;
  }
  async listStatuses(): Promise<StatusInfo[]> {
    return [];
  }
  async listComments(): Promise<CommentInfo[]> {
    return [];
  }
  async createComment(number: number, body: string): Promise<void> {
    this.writes.push(`comment #${number}`);
    this.comments.push(body);
  }
  async mergePull(number: number): Promise<void> {
    this.writes.push(`merge #${number}`);
  }
  async listOpenIssues(): Promise<IssueInfo[]> {
    return this.issues.filter((i) => i.state === "open");
  }
  async createIssue(input: { title: string; body: string; labels: string[] }): Promise<IssueInfo> {
    this.writes.push(`create issue ${input.title}`);
    const issue = { number: this.nextIssue++, state: "open", ...input };
    this.issues.push(issue);
    return issue;
  }
  async updateIssue(
    number: number,
    input: { body?: string; state?: "open" | "closed" },
  ): Promise<void> {
    this.writes.push(`update issue #${number}`);
    const issue = this.issues.find((i) => i.number === number);
    if (issue) Object.assign(issue, input);
  }
  async removeLabel(number: number, label: string): Promise<void> {
    this.writes.push(`remove label ${label}`);
    this.removedLabels.push(label);
    const issue = this.issues.find((i) => i.number === number);
    if (issue) issue.labels = issue.labels.filter((l) => l !== label);
  }
  async findReleaseAsset(): Promise<ReleaseAsset | null> {
    return this.asset;
  }
  async assetSignedUrl(): Promise<string> {
    return SECRETS.signedUrl;
  }
  async assetBytes(_id: number, mask: (value: string) => string): Promise<Uint8Array> {
    mask(SECRETS.signedUrl);
    return this.assetBytesValue;
  }
  async getRun(id: number): Promise<RunInfo> {
    const run = this.runs.get(id);
    if (!run) throw new Error("no run");
    return run;
  }

  /** Daily-job fixtures (PST-23, PST-33, PST-11). */
  branches: BranchInfo[] = [];
  branchFiles = new Map<string, string[]>();
  pathCommits: string[] = [];
  commitFilesMap = new Map<string, string[]>();
  workflowRuns = new Map<string, WorkflowRun[]>();
  /** Open or closed, like the search API. */
  async findIssueByTitle(title: string, label: string): Promise<IssueInfo | null> {
    return this.issues.find((i) => i.title === title && i.labels.includes(label)) ?? null;
  }
  /** Blob SHAs by `ref:path`; a file not listed differs on every ref. */
  fileShas = new Map<string, string>();
  async fileSha(path: string, ref: string): Promise<string | null> {
    return this.fileShas.get(`${ref}:${path}`) ?? `sha-of-${ref}-${path}`;
  }
  async listBranches(): Promise<BranchInfo[]> {
    return this.branches;
  }
  async compareFiles(_base: string, head: string): Promise<string[]> {
    return this.branchFiles.get(head) ?? [];
  }
  async listCommitsOfPath(): Promise<string[]> {
    return this.pathCommits;
  }
  async commitFiles(sha: string): Promise<string[]> {
    return this.commitFilesMap.get(sha) ?? [];
  }
  async listWorkflowRuns(file: string): Promise<WorkflowRun[]> {
    return this.workflowRuns.get(file) ?? [];
  }

  alertIssues(): IssueInfo[] {
    return this.issues.filter((i) => i.labels.includes("post-alert"));
  }
}

export class FakeInstagram implements InstagramApi {
  calls: string[] = [];
  statuses = new Map<string, ContainerStatus>();
  createFails: Error | null = null;
  waitFails: Error | null = null;
  publishFailsButPublishes = false;
  publishFails: Error | null = null;
  onBeforePublish: (() => void) | null = null;
  onWait: (() => void) | null = null;
  expiredFirst = false;
  #n = 0;

  count(name: string): number {
    return this.calls.filter((c) => c === name).length;
  }
  async createReelContainer(input: { videoUrl: string; caption: string }): Promise<string> {
    this.calls.push("create");
    if (input.videoUrl !== SECRETS.signedUrl) throw new Error("unexpected url");
    if (this.createFails) throw this.createFails;
    const id = `container-${++this.#n}`;
    this.statuses.set(id, "IN_PROGRESS");
    return id;
  }
  async containerStatus(id: string): Promise<ContainerStatus> {
    this.calls.push("status");
    return this.statuses.get(id) ?? "ERROR";
  }
  async waitUntilReady(id: string): Promise<ContainerStatus> {
    this.calls.push("wait");
    this.onWait?.();
    if (this.waitFails) throw this.waitFails;
    if (this.expiredFirst) {
      this.expiredFirst = false;
      this.statuses.set(id, "EXPIRED");
      throw new ContainerFailedError("EXPIRED");
    }
    if (this.statuses.get(id) === "IN_PROGRESS") this.statuses.set(id, "FINISHED");
    return this.statuses.get(id) ?? "ERROR";
  }
  async publish(id: string): Promise<string> {
    this.onBeforePublish?.();
    this.calls.push("publish");
    if (this.publishFailsButPublishes) {
      this.statuses.set(id, "PUBLISHED");
      throw new Error("timeout");
    }
    if (this.publishFails) throw this.publishFails;
    this.statuses.set(id, "PUBLISHED");
    return "media-1";
  }
  async permalink(): Promise<string | null> {
    this.calls.push("permalink");
    return "https://www.instagram.com/reel/abc/";
  }
}

export class FakeYoutube implements YoutubeApi {
  calls: string[] = [];
  startFails: Error | null = null;
  uploadFails: Error | null = null;
  privacy = "public";
  rejected = false;
  onToken: (() => void) | null = null;
  uploaded: Uint8Array[] = [];
  count(name: string): number {
    return this.calls.filter((c) => c === name).length;
  }
  async accessToken(): Promise<string> {
    this.calls.push("token");
    this.onToken?.();
    return SECRETS.ytAccess;
  }
  async startUpload(token: string): Promise<string> {
    this.calls.push("start");
    if (token !== SECRETS.ytAccess) throw new Error("bad token");
    if (this.startFails) throw this.startFails;
    return SECRETS.session;
  }
  async upload(session: string, bytes: Uint8Array): Promise<string> {
    this.calls.push("upload");
    if (session !== SECRETS.session) throw new Error("bad session");
    this.uploaded.push(bytes);
    if (this.uploadFails) throw this.uploadFails;
    return "yt-video-1";
  }
  async videoStatus(): Promise<YoutubeVideoStatus | null> {
    this.calls.push("videoStatus");
    return { privacyStatus: this.privacy, uploadStatus: "processed", rejected: this.rejected };
  }
}

/** A value that must be there; a clear failure instead of a non-null assertion. */
export function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("expected a value");
  return value;
}
