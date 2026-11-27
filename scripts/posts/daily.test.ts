import { beforeEach, describe, expect, it } from "vitest";
import {
  cronLines,
  POST_DAYS,
  POST_TIMEZONE,
  type PostRecord,
} from "../../packages/shared/src/posts.ts";
import { type DailyDeps, type DailyReport, extractCronLines, runDaily } from "./daily.ts";
import type { PullInfo } from "./github.ts";
import { ApiError } from "./mask.ts";
import { MemoryStateStore } from "./state.ts";
import {
  FakeGitHub,
  FakeInstagram,
  FakeYoutube,
  makeRecord,
  must,
  RECORD_PATH,
  recordFile,
  STEM,
} from "./testkit.ts";

/** Friday 2026-11-27 12:00 UTC: the Thursday slot (22:00 UTC) ended 14 h ago, local date 27th, 09:00. */
const NOW = new Date("2026-11-27T12:00:00Z");
const DAY = 86_400_000;

const KEYS = {
  ig: "IGTOKEN-SECRET-123",
  appId: "META-APP-ID-111",
  appSecret: "META-APP-SECRET-222",
  ytClient: "YT-CLIENT-SECRET-333",
  ytRefresh: "YT-REFRESH-SECRET-444",
  ytAccess: "YT-ACCESS-FROM-REFRESH-555",
  pat: "OPS-PAT-SECRET-666",
};

/** A network that answers Meta, Google and the PAT call; nothing leaves the process. */
class StubNet {
  calls: { url: string; auth: string | null; method: string }[] = [];
  ig: { status: number; body: unknown } = {
    status: 200,
    body: {
      data: {
        is_valid: true,
        expires_at: 0,
        data_access_expires_at: 0,
        type: "SYSTEM_USER",
        scopes: ["instagram_basic", "instagram_content_publish"],
      },
    },
  };
  refresh: { status: number; scope: string } = {
    status: 200,
    scope:
      "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly",
  };
  channelsStatus = 200;
  patStatus = 200;
  patHeader: string | null = null;

  fetch = async (url: string, init?: RequestInit): Promise<Response> => {
    const headers = new Headers(init?.headers);
    this.calls.push({ url, auth: headers.get("authorization"), method: init?.method ?? "GET" });
    if (url.startsWith("https://graph.facebook.com/v23.0/debug_token")) {
      return Response.json(this.ig.body, { status: this.ig.status });
    }
    if (url === "https://oauth2.googleapis.com/token") {
      if (this.refresh.status !== 200) {
        return Response.json({ error: "invalid_grant" }, { status: this.refresh.status });
      }
      return Response.json({ access_token: KEYS.ytAccess, scope: this.refresh.scope });
    }
    if (url.startsWith("https://www.googleapis.com/youtube/v3/channels")) {
      return new Response("{}", { status: this.channelsStatus });
    }
    if (url.includes("/actions/secrets/public-key")) {
      return new Response("{}", {
        status: this.patStatus,
        headers: this.patHeader ? { "github-authentication-token-expiration": this.patHeader } : {},
      });
    }
    throw new Error("unexpected url");
  };
}

let gh: FakeGitHub;
let store: MemoryStateStore;
let ig: FakeInstagram;
let yt: FakeYoutube;
let net: StubNet;
let log: string[];

beforeEach(() => {
  gh = new FakeGitHub();
  store = new MemoryStateStore();
  ig = new FakeInstagram();
  yt = new FakeYoutube();
  net = new StubNet();
  log = [];
});

const goodWorkflow = (now = NOW): string =>
  [
    "on:",
    "  schedule:",
    ...cronLines("19:00", POST_TIMEZONE, POST_DAYS, now).map((c) => `    - cron: "${c}"`),
  ].join("\n");

const run = (
  over: Partial<DailyDeps> = {},
  record: PostRecord | null = null,
): Promise<DailyReport> =>
  runDaily({
    gh,
    store,
    instagram: ig,
    youtube: yt,
    fetch: net.fetch,
    files: record ? [recordFile(record)] : [],
    workflowText: goodWorkflow(),
    now: NOW,
    postTime: "19:00",
    secrets: {
      igAccessToken: KEYS.ig,
      metaAppId: KEYS.appId,
      metaAppSecret: KEYS.appSecret,
      ytClientId: "yt-client-id",
      ytClientSecret: KEYS.ytClient,
      ytRefreshToken: KEYS.ytRefresh,
    },
    dryRun: false,
    out: (line) => log.push(line),
    ...over,
  });

const titles = (): string[] => gh.issues.map((i) => i.title);
const published = (iso: string) => ({
  status: "published" as const,
  attempts: 1,
  platform_id: "id-1",
  url: null,
  published_at: iso,
  issue: null,
  error: null,
  metrics: null,
});

describe("PST-22.1 Instagram token check", () => {
  it("PST-22.1 a valid token without expiry opens nothing, uses the app token as Bearer, and writes dates only", async () => {
    const report = await run();
    expect(report.errors).toBe(0);
    expect(gh.issues).toEqual([]);
    const call = must(net.calls.find((c) => c.url.includes("debug_token")));
    expect(call.auth).toBe(`Bearer ${KEYS.appId}|${KEYS.appSecret}`);
    expect(call.url).toContain("input_token=");
    expect(JSON.parse(store.tokensText ?? "{}")).toEqual({
      schema: 1,
      checked_on: "2026-11-27",
      instagram: { ok: true, expires_on: null },
      youtube: { ok: true },
    });
  });
  it("PST-22.1 an invalid token, an expiry within IG_TOKEN_WARN_DAYS and a missing permission each alert once", async () => {
    const soon = Math.floor((NOW.getTime() + 5 * DAY) / 1000);
    net.ig.body = { data: { is_valid: false, expires_at: soon, scopes: ["instagram_basic"] } };
    await run();
    await run();
    const issue = must(gh.issues.find((i) => i.labels.includes("token-expiry")));
    expect(gh.issues).toHaveLength(1);
    expect(issue.body).toContain("no longer valid");
    expect(issue.body).toContain("2026-12-02");
    expect(issue.body).toContain("instagram_content_publish");
    expect(issue.body).toContain("IG_ACCESS_TOKEN");
  });
  it("PST-22.1 an expiry date far away is stored but does not alert", async () => {
    const far = Math.floor((NOW.getTime() + 60 * DAY) / 1000);
    net.ig.body = {
      data: { is_valid: true, expires_at: far, scopes: ["instagram_content_publish"] },
    };
    await run();
    expect(gh.issues).toEqual([]);
    expect(JSON.parse(store.tokensText ?? "{}").instagram.expires_on).toBe("2027-01-26");
  });
  it("PST-22.1 a refused debug_token (400) alerts with status and code, never a body", async () => {
    net.ig = { status: 400, body: { error: { code: 190, message: "secret text" } } };
    await run();
    const issue = must(gh.issues[0]);
    expect(issue.body).toContain("http_status=400, code=190");
    expect(issue.body).not.toContain("secret text");
  });
  it("PST-22.1 a server error is no verdict: counted as an error, no alert", async () => {
    net.ig = { status: 503, body: {} };
    const report = await run();
    expect(report.errors).toBe(1);
    expect(gh.issues).toEqual([]);
  });
});

describe("PST-22 YouTube token check", () => {
  it("PST-22 a missing scope opens a token-expiry alert with the manual steps", async () => {
    net.refresh.scope = "https://www.googleapis.com/auth/youtube.upload";
    await run();
    const issue = must(gh.issues.find((i) => i.title.includes("(youtube)")));
    expect(issue.labels).toEqual(["token-expiry"]);
    expect(issue.body).toContain("youtube.readonly");
    expect(issue.body).toContain("OAuth Playground");
    expect(issue.body).toContain("consent prompt");
  });
  it("PST-22 a refused refresh and a channels.list that is not 200 alert", async () => {
    net.refresh.status = 400;
    await run();
    expect(must(gh.issues[0]).body).toContain("http_status=400, code=invalid_grant");
    gh.issues = [];
    net.refresh.status = 200;
    net.channelsStatus = 403;
    await run();
    expect(must(gh.issues[0]).body).toContain("channels.list answered http_status=403");
  });
});

describe("PST-23 the PAT expiry", () => {
  it("PST-23 reads the expiry from the response header and warns under OPS_PAT_WARN_DAYS", async () => {
    net.patHeader = "2026-12-05 10:00:00 UTC";
    await run({ secrets: { ...secretsAll(), opsPat: KEYS.pat } });
    const issue = must(gh.issues.find((i) => i.title.includes("ops-secrets-pat")));
    expect(issue.body).toContain("2026-12-05");
    expect(JSON.parse(store.tokensText ?? "{}").ops_pat).toEqual({ expires_on: "2026-12-05" });
    const call = must(net.calls.find((c) => c.url.includes("public-key")));
    expect(call.auth).toBe(`Bearer ${KEYS.pat}`);
  });
  it("PST-23 a far expiry is only stored; an unset PAT is skipped with a log line", async () => {
    net.patHeader = "2027-03-01 10:00:00 UTC";
    await run({ secrets: { ...secretsAll(), opsPat: KEYS.pat } });
    expect(gh.issues).toEqual([]);
    log = [];
    const report = await run();
    expect(log.join("\n")).toContain("OPS_SECRETS_PAT is not set");
    expect(report.errors).toBe(0);
  });
});

const secretsAll = () => ({
  igAccessToken: KEYS.ig,
  metaAppId: KEYS.appId,
  metaAppSecret: KEYS.appSecret,
  ytClientId: "yt-client-id",
  ytClientSecret: KEYS.ytClient,
  ytRefreshToken: KEYS.ytRefresh,
});

describe("PST-12 missed slots (daily)", () => {
  it("PST-12 a merged record whose window ended unpublished gets skipped and one alert per platform, once", async () => {
    await run({}, makeRecord({ date: "2026-11-24" }));
    const state = must(await store.read("2026-11-24-restart-after-gap"));
    expect(state.platforms.instagram?.status).toBe("skipped");
    expect(state.platforms.youtube?.status).toBe("skipped");
    const alerts = gh.issues.filter((i) => i.title.includes("Post alert: 2026-11-24"));
    expect(alerts).toHaveLength(2);
    const writes = gh.writes.length;
    await run({}, makeRecord({ date: "2026-11-24" }));
    expect(gh.writes).toHaveLength(writes);
  });
  it("PST-12 a slot of any age is swept", async () => {
    await run({}, makeRecord({ date: "2026-06-02" }));
    expect((await store.read("2026-06-02-restart-after-gap"))?.platforms.instagram?.status).toBe(
      "skipped",
    );
  });
  it("PST-12 a queued post that is already public is recorded, not skipped", async () => {
    await store.write(STEM, {
      schema: 1,
      platforms: {
        instagram: {
          ...published("2026-11-26T22:05:00Z"),
          status: "queued",
          published_at: null,
          platform_id: "container-9",
        },
      },
    });
    ig.statuses.set("container-9", "PUBLISHED");
    await run({}, makeRecord({ platforms: { instagram: must(makeRecord().platforms.instagram) } }));
    expect((await store.read(STEM))?.platforms.instagram?.status).toBe("published");
  });
  it("PST-12 YouTube queued without a video id becomes failed with a Studio alert, not skipped", async () => {
    await store.write(STEM, {
      schema: 1,
      platforms: {
        youtube: {
          ...published("2026-11-26T22:05:00Z"),
          status: "queued",
          published_at: null,
          platform_id: null,
        },
      },
    });
    await run({}, makeRecord({ platforms: { youtube: must(makeRecord().platforms.youtube) } }));
    expect((await store.read(STEM))?.platforms.youtube?.status).toBe("failed");
    expect(gh.issues.some((i) => i.body.includes("YouTube Studio"))).toBe(true);
  });
  it("PST-12 a published, skipped or draft platform is left alone", async () => {
    await store.write(STEM, {
      schema: 1,
      platforms: { instagram: published("2026-11-26T22:05:00Z") },
    });
    await run({}, makeRecord({ platforms: { instagram: must(makeRecord().platforms.instagram) } }));
    expect((await store.read(STEM))?.platforms.instagram?.status).toBe("published");
  });
});

describe("PST-23 no publish on a post day (T18)", () => {
  it("T18 PST-23 a record of yesterday with no platform state alerts once, and not again", async () => {
    await run({}, makeRecord());
    const notPublished = gh.issues.filter(
      (i) => i.title === `${STEM}: nothing was published for this post day`,
    );
    expect(notPublished).toHaveLength(1);
    expect(notPublished[0]?.labels).toEqual(["post-alert"]);
    // The owner closes it; the next run does not open it again.
    must(notPublished[0]).state = "closed";
    await run({}, makeRecord());
    expect(gh.issues.filter((i) => i.title.includes("nothing was published"))).toHaveLength(1);
  });
  it("T18 PST-23 a record with a published platform does not alert", async () => {
    await store.write(STEM, {
      schema: 1,
      platforms: { instagram: published("2026-11-26T22:05:00Z") },
    });
    await run({}, makeRecord());
    expect(gh.issues.some((i) => i.title.includes("nothing was published"))).toBe(false);
  });
  it("T18 PST-23 a record from three days ago is not a post day of today or yesterday", async () => {
    await run({}, makeRecord({ date: "2026-11-24" }));
    expect(gh.issues.some((i) => i.title.includes("nothing was published"))).toBe(false);
  });
});

describe("PST-23 cron coverage", () => {
  it("PST-11 PST-23 matching cron lines are fine", async () => {
    await run();
    expect(log.join("\n")).toContain("cron-coverage: ok");
    expect(gh.issues).toEqual([]);
  });
  it("acceptance 4: a changed timezone offset makes the check fail", async () => {
    // Lines made for UTC-2 (daylight saving back) no longer fit UTC-3.
    const shifted = cronLines(
      "19:00",
      "America/Sao_Paulo",
      POST_DAYS,
      new Date("2018-01-15T12:00:00Z"),
    );
    const text = shifted.map((c) => `    - cron: '${c}'`).join("\n");
    await run({ workflowText: text });
    const issue = must(gh.issues.find((i) => i.title.includes("ops-cron-lines")));
    expect(issue.labels).toEqual(["post-alert"]);
    expect(issue.body).toContain("Expected");
  });
  it("PST-23 a missing scheduler file alerts", async () => {
    await run({ workflowText: null });
    expect(must(gh.issues.find((i) => i.title.includes("ops-cron-lines"))).body).toContain(
      "not found",
    );
  });
  it("PST-11 the cron extraction reads quoted lines and ignores comments", () => {
    expect(extractCronLines('  - cron: "7,22 22 * * 2,4" # window\n  - cron: 7 1 * * 3')).toEqual([
      "7,22 22 * * 2,4",
      "7 1 * * 3",
    ]);
  });
});

const mergedPull = (sha: string): PullInfo => ({
  ...must(new FakeGitHub().pulls[0]),
  merged_at: "2026-11-26T20:00:00Z",
  merge_commit_sha: sha,
});

describe("PST-33 trust checks (acceptance 9)", () => {
  beforeEach(() => {
    gh.pathCommits = ["direct1111111", "merged222222"];
    gh.pullsBySha.set("direct1111111", []);
    gh.pullsBySha.set("merged222222", [mergedPull("merged222222")]);
    gh.commitFilesMap.set("direct1111111", [".github/workflows/posts-publish.yml", "README.md"]);
  });
  it("PST-33 a direct push under .github/workflows/ opens an ops-security alert naming file and commit, once", async () => {
    await run();
    await run();
    const alerts = gh.issues.filter((i) => i.labels.includes("ops-security"));
    expect(alerts).toHaveLength(1);
    expect(must(alerts[0]).body).toContain(".github/workflows/posts-publish.yml");
    expect(must(alerts[0]).body).toContain("direct1111111");
    expect(must(alerts[0]).body).not.toContain("README.md");
  });
  it("PST-33 a commit that is the merge commit of a merged PR is not flagged", async () => {
    gh.pathCommits = ["merged222222"];
    await run();
    expect(gh.issues.filter((i) => i.labels.includes("ops-security"))).toEqual([]);
  });
  it("PST-33 a PR that is open for the commit does not make it legitimate", async () => {
    gh.pathCommits = ["merged222222"];
    gh.pullsBySha.set("merged222222", [{ ...mergedPull("merged222222"), merged_at: null }]);
    await run();
    expect(gh.issues.filter((i) => i.labels.includes("ops-security"))).toHaveLength(1);
  });
  it("PST-33 a branch with workflow changes alerts; the head of an open ops-workflow: PR only gets one low-priority notice", async () => {
    gh.pathCommits = [];
    gh.branches = [
      { name: "main", sha: "m".repeat(40) },
      { name: "sneaky", sha: "a1b2c3d4e5f6" },
      { name: "wf-change", sha: "f6e5d4c3b2a1" },
      { name: "posts-only", sha: "0123456789ab" },
    ];
    gh.branchFiles.set("sneaky", [".github/workflows/evil.yml"]);
    gh.branchFiles.set("wf-change", [".github/workflows/posts-publish.yml"]);
    gh.branchFiles.set("posts-only", ["posts/2026/x.json"]);
    gh.openPulls = [
      {
        ...must(gh.pulls[0]),
        number: 77,
        state: "open",
        merged_at: null,
        title: "ops-workflow: change the cron",
        head_ref: "wf-change",
      },
    ];
    await run();
    await run();
    const security = gh.issues.filter((i) => i.labels.includes("ops-security"));
    expect(security).toHaveLength(2);
    const alert = must(security.find((i) => i.body.includes("sneaky")));
    expect(alert.body).toContain(".github/workflows/evil.yml");
    expect(alert.body).toContain("a1b2c3d4e5f6");
    const notice = must(security.find((i) => i.title.includes("ops-workflow-pr-77")));
    expect(notice.body).toContain("Low priority");
    expect(security.some((i) => i.body.includes("posts-only"))).toBe(false);
  });
  it("PST-33 a branch whose PR title does not start with ops-workflow: is flagged", async () => {
    gh.pathCommits = [];
    gh.branches = [{ name: "wf-change", sha: "f6e5d4c3b2a1" }];
    gh.branchFiles.set("wf-change", [".github/workflows/posts-publish.yml"]);
    gh.openPulls = [
      {
        ...must(gh.pulls[0]),
        number: 78,
        state: "open",
        merged_at: null,
        title: "chore: tidy",
        head_ref: "wf-change",
      },
    ];
    await run();
    expect(gh.issues.filter((i) => i.labels.includes("ops-security"))[0]?.body).toContain(
      "wf-change",
    );
  });
});

describe("PST-11 cancelled runs (acceptance 10)", () => {
  const runOf = (id: number, conclusion: string | null, daysAgo = 1) => ({
    id,
    status: "completed",
    conclusion,
    created_at: new Date(NOW.getTime() - daysAgo * DAY).toISOString(),
  });
  it("PST-11 one alert per cancelled run id, none for others, and a second run changes nothing", async () => {
    gh.workflowRuns.set("posts-publish.yml", [runOf(11, "cancelled"), runOf(12, "success")]);
    gh.workflowRuns.set("posts-daily.yml", [runOf(21, "cancelled"), runOf(22, "cancelled", 30)]);
    await run();
    const alerts = gh.issues.filter((i) => i.body.includes("Run id:"));
    expect(alerts.map((i) => i.body.split("\n")[0]).sort()).toEqual(["Run id: 11", "Run id: 21"]);
    const writes = gh.writes.length;
    await run();
    expect(gh.writes).toHaveLength(writes);
  });
});

describe("PST-19 verification and Content ID", () => {
  it("PST-19 a YouTube post published yesterday gets one short Content ID issue", async () => {
    await store.write(STEM, {
      schema: 1,
      platforms: {
        youtube: {
          ...published("2026-11-26T22:10:00Z"),
          url: "https://www.youtube.com/shorts/abc",
        },
      },
    });
    await run({}, makeRecord());
    await run({}, makeRecord());
    const issues = gh.issues.filter(
      (i) => i.title === `Check Content ID claims in Studio for ${STEM}`,
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]?.labels).toEqual(["post-reminder"]);
  });
  it("PST-19 a post published today gets none yet", async () => {
    await store.write(STEM, {
      schema: 1,
      platforms: { youtube: published("2026-11-27T10:00:00Z") },
    });
    await run({}, makeRecord());
    expect(titles().some((t) => t.startsWith("Check Content ID"))).toBe(false);
  });
  it("PST-19 an Instagram post without a url gets its permalink read and stored", async () => {
    await store.write(STEM, {
      schema: 1,
      platforms: { instagram: published("2026-11-26T22:10:00Z") },
    });
    await run({}, makeRecord());
    expect((await store.read(STEM))?.platforms.instagram?.url).toBe(
      "https://www.instagram.com/reel/abc/",
    );
    expect(ig.count("permalink")).toBe(1);
  });
  it("PST-19 when the permalink cannot be read, one reminder issue says so and the url stays null", async () => {
    ig.permalink = async () => {
      throw new ApiError("Instagram", 400, "100");
    };
    await store.write(STEM, {
      schema: 1,
      platforms: { instagram: published("2026-11-26T22:10:00Z") },
    });
    await run({}, makeRecord());
    await run({}, makeRecord());
    expect((await store.read(STEM))?.platforms.instagram?.url).toBeNull();
    const issues = gh.issues.filter((i) => i.title === `Instagram permalink for ${STEM}`);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.body).toContain("paste it in this issue");
  });
});

describe("T18 unmerged records in the daily job", () => {
  it("T18 an open record PR whose post time passed gets the alert, and the daily job never merges", async () => {
    const open = {
      ...must(gh.pulls[0]),
      number: 30,
      state: "open",
      merged_at: null,
      merge_commit_sha: null,
    };
    gh.openPulls = [open];
    gh.pulls = [open];
    gh.pullFiles.set(30, [{ filename: RECORD_PATH, status: "added" }]);
    gh.getFileText = async () => JSON.stringify(makeRecord());
    await run();
    const alert = must(
      gh.issues.find((i) => i.title === `${STEM}: record not merged at post time`),
    );
    expect(alert.labels).toEqual(["post-alert"]);
    expect(gh.writes.some((w) => w.startsWith("merge"))).toBe(false);
  });
});

describe("PST-23 steps are independent and safe", () => {
  it("PST-23 a step that fails is logged with status and code only and the others still run", async () => {
    gh.listBranches = async () => {
      throw new ApiError("GitHub", 500, null);
    };
    gh.workflowRuns.set("posts-publish.yml", [
      { id: 5, status: "completed", conclusion: "cancelled", created_at: NOW.toISOString() },
    ]);
    const report = await run();
    expect(report.errors).toBe(1);
    expect(log.join("\n")).toContain("trust: error (http_status=500, code=none)");
    expect(gh.issues.some((i) => i.body.includes("Run id: 5"))).toBe(true);
  });
  it("PST-23 a dry run reads GitHub, prints the plan, and writes and calls nothing else", async () => {
    gh.workflowRuns.set("posts-publish.yml", [
      { id: 5, status: "completed", conclusion: "cancelled", created_at: NOW.toISOString() },
    ]);
    await run({ dryRun: true }, makeRecord());
    expect(gh.writes).toEqual([]);
    expect(store.commits).toEqual([]);
    expect(store.files.size).toBe(0);
    expect(store.tokensText).toBeNull();
    expect(net.calls).toEqual([]);
    expect(ig.calls).toEqual([]);
    expect(yt.calls).toEqual([]);
    expect(log.join("\n")).toContain("would open");
  });
  it("PST-23 a rerun of a full day changes nothing", async () => {
    gh.workflowRuns.set("posts-publish.yml", [
      { id: 5, status: "completed", conclusion: "cancelled", created_at: NOW.toISOString() },
    ]);
    await run({}, makeRecord());
    const writes = gh.writes.length;
    const issues = gh.issues.length;
    await run({}, makeRecord());
    expect(gh.issues).toHaveLength(issues);
    expect(gh.writes).toHaveLength(writes);
  });
});

describe("PST-20 secrets in the daily output (acceptance 8)", () => {
  it("PST-20 no token, header, URL or query string is printed, and every secret is masked first", async () => {
    net.ig.body = { data: { is_valid: false, scopes: [] } };
    net.refresh.scope = "x";
    net.patHeader = "2026-12-02 10:00:00 UTC";
    gh.workflowRuns.set("posts-publish.yml", [
      { id: 5, status: "completed", conclusion: "cancelled", created_at: NOW.toISOString() },
    ]);
    await run({ secrets: { ...secretsAll(), opsPat: KEYS.pat } }, makeRecord());
    const masks = log.filter((l) => l.startsWith("::add-mask::")).map((l) => l.slice(12));
    expect(masks).toEqual(
      expect.arrayContaining([
        KEYS.ig,
        KEYS.appId,
        KEYS.appSecret,
        `${KEYS.appId}|${KEYS.appSecret}`,
        KEYS.ytClient,
        KEYS.ytRefresh,
        KEYS.ytAccess,
        KEYS.pat,
      ]),
    );
    // Every mask line comes before the first use (the first network call prints after the masks).
    const rest = log.filter((l) => !l.startsWith("::add-mask::")).join("\n");
    for (const secret of Object.values(KEYS)) expect(rest).not.toContain(secret);
    expect(rest).not.toMatch(/https?:\/\//);
    expect(rest).not.toContain("?");
    expect(rest).not.toMatch(/authorization|bearer/i);
    const bodies = gh.issues.map((i) => i.body).join("\n");
    const files = [...store.files.values(), store.tokensText ?? ""].join("\n");
    for (const secret of Object.values(KEYS)) {
      expect(bodies).not.toContain(secret);
      expect(files).not.toContain(secret);
    }
    expect(bodies).not.toMatch(/https?:\/\/[^\s]*\?/);
  });
});
