import { beforeEach, describe, expect, it } from "vitest";
import type { PostRecord } from "../../packages/shared/src/posts.ts";
import { ApiError } from "./mask.ts";
import { runScheduler, type SchedulerDeps, type SchedulerReport } from "./scheduler.ts";
import { MemoryStateStore } from "./state.ts";
import {
  at,
  FakeGitHub,
  FakeInstagram,
  FakeYoutube,
  goodProbe,
  makeRecord,
  must,
  recordFile,
  SECRETS,
  STEM,
} from "./testkit.ts";

let gh: FakeGitHub;
let store: MemoryStateStore;
let ig: FakeInstagram;
let yt: FakeYoutube;
let log: string[];

beforeEach(() => {
  gh = new FakeGitHub();
  store = new MemoryStateStore();
  ig = new FakeInstagram();
  yt = new FakeYoutube();
  log = [];
});

const run = (
  minutes: number,
  over: Partial<SchedulerDeps> = {},
  record: PostRecord = makeRecord(),
): Promise<SchedulerReport> =>
  runScheduler({
    gh,
    store,
    instagram: ig,
    youtube: yt,
    probe: goodProbe,
    files: [recordFile(record)],
    now: at(minutes),
    postTime: "19:00",
    approverLogin: "github-actions[bot]",
    dryRun: false,
    out: (line) => log.push(line),
    ...over,
  });

const stateOf = async () => (await store.read(STEM))?.platforms;

describe("PST-14 and PST-14a: a full run", () => {
  it("PST-13 a full run publishes once on each platform and a rerun posts nothing again", async () => {
    await run(5);
    expect(ig.count("publish")).toBe(1);
    expect(yt.count("upload")).toBe(1);
    const s = await stateOf();
    expect(s?.instagram).toMatchObject({ status: "published", platform_id: "media-1" });
    expect(s?.youtube).toMatchObject({ status: "published", platform_id: "yt-video-1" });
    await run(20);
    expect(ig.count("publish")).toBe(1);
    expect(ig.count("create")).toBe(1);
    expect(yt.count("upload")).toBe(1);
  });

  it("PST-13 queued is pushed before the publish call and before the upload starts", async () => {
    const seen: string[] = [];
    ig.onBeforePublish = () => seen.push(`ig:${store.commits.join("|")}`);
    const origStart = yt.startUpload.bind(yt);
    yt.startUpload = async (t) => {
      seen.push(`yt:${store.commits.join("|")}`);
      return origStart(t);
    };
    await run(5);
    expect(seen[0]).toContain("instagram queued");
    expect(seen[1]).toContain("youtube queued");
  });

  it("PST-13 a push that fails stops the run before any publish", async () => {
    store.failPushes = 99;
    await expect(run(5)).rejects.toThrow("could not be pushed");
    expect(ig.count("publish")).toBe(0);
    expect(yt.count("upload")).toBe(0);
  });

  it("PST-13 a rerun after a timeout on publish asks the platform and does not publish twice", async () => {
    ig.publishFailsButPublishes = true;
    await run(5);
    const s = await stateOf();
    expect(s?.instagram).toMatchObject({ status: "published", platform_id: "container-1" });
    await run(20);
    expect(ig.count("publish")).toBe(1);
  });

  it("PST-13 a run that finds a queued container asks its status and does not make a second container", async () => {
    await store.write(STEM, {
      schema: 1,
      platforms: {
        instagram: {
          status: "queued",
          attempts: 1,
          platform_id: "container-9",
          url: null,
          published_at: null,
          issue: null,
          error: null,
          metrics: null,
        },
      },
    });
    ig.statuses.set("container-9", "FINISHED");
    await run(20);
    expect(ig.count("create")).toBe(0);
    expect(ig.count("publish")).toBe(1);
  });

  it("PST-14 a PUBLISHED container is only recorded, never published again", async () => {
    await store.write(STEM, {
      schema: 1,
      platforms: {
        instagram: {
          status: "queued",
          attempts: 1,
          platform_id: "container-9",
          url: null,
          published_at: null,
          issue: null,
          error: null,
          metrics: null,
        },
      },
    });
    ig.statuses.set("container-9", "PUBLISHED");
    await run(20);
    expect(ig.count("publish")).toBe(0);
    expect((await stateOf())?.instagram).toMatchObject({
      status: "published",
      platform_id: "container-9",
    });
  });

  it("PST-14 an expired container inside the window gets a new container and URL", async () => {
    ig.expiredFirst = true;
    await run(5);
    expect(ig.count("create")).toBe(2);
    expect(ig.count("publish")).toBe(1);
  });

  it("PST-14a YouTube confirms public with videos.list and a private video fails with the texts", async () => {
    yt.privacy = "private";
    await run(5, {}, makeRecord({ platforms: { youtube: must(makeRecord().platforms.youtube) } }));
    expect((await stateOf())?.youtube).toMatchObject({
      status: "failed",
      platform_id: "yt-video-1",
    });
    const alert = gh.alertIssues()[0];
    expect(alert?.body).toContain("Title: Restart");
    expect(yt.count("upload")).toBe(1);
  });
});

describe("PST-12 window and slots", () => {
  it("PST-12 a future slot is not due", async () => {
    await run(-1);
    expect(ig.calls).toEqual([]);
    expect(await stateOf()).toBeUndefined();
  });
  it("PST-12 the window end is inclusive", async () => {
    await run(90);
    expect(ig.count("publish")).toBe(1);
  });
  it("PST-12 a slot more than the window ago is skipped with an alert, never published late", async () => {
    await run(91);
    expect(ig.calls).toEqual([]);
    expect(yt.calls).toEqual([]);
    expect((await stateOf())?.instagram?.status).toBe("skipped");
    expect(gh.alertIssues()).toHaveLength(2);
  });
  it("PST-12 a missed queued post that is already public is recorded, not skipped", async () => {
    await store.write(STEM, {
      schema: 1,
      platforms: {
        instagram: {
          status: "queued",
          attempts: 1,
          platform_id: "container-9",
          url: null,
          published_at: null,
          issue: null,
          error: null,
          metrics: null,
        },
      },
    });
    ig.statuses.set("container-9", "PUBLISHED");
    await run(
      120,
      {},
      makeRecord({ platforms: { instagram: must(makeRecord().platforms.instagram) } }),
    );
    expect((await stateOf())?.instagram?.status).toBe("published");
  });
  it("PST-12 platforms other than Instagram and YouTube are not touched", async () => {
    const base = makeRecord();
    await run(
      5,
      {},
      makeRecord({
        platforms: {
          ...base.platforms,
          tiktok: must(base.platforms.instagram),
          linkedin: must(base.platforms.instagram),
        },
      }),
    );
    expect((await stateOf())?.tiktok).toBeUndefined();
    expect((await stateOf())?.linkedin).toBeUndefined();
  });
  it("PST-12 a draft or skipped platform is left alone", async () => {
    const base = makeRecord();
    await run(
      5,
      {},
      makeRecord({
        platforms: {
          instagram: { ...must(base.platforms.instagram), status: "draft" },
          youtube: { ...must(base.platforms.youtube), status: "skipped" },
        },
      }),
    );
    expect(ig.calls).toEqual([]);
    expect(yt.calls).toEqual([]);
  });
});

describe("PST-10 approval at publish time", () => {
  const notPublished = async () => {
    await run(5);
    expect(ig.count("create")).toBe(0);
    expect(ig.count("publish")).toBe(0);
    expect(yt.count("upload")).toBe(0);
    expect((await stateOf())?.instagram?.status).toBe("failed");
    expect(gh.alertIssues().length).toBeGreaterThan(0);
  };
  it("PST-10 a record whose last commit is not a merged PR is not published and alerts", async () => {
    gh.pulls = [];
    await notPublished();
  });
  it("PST-10 a record from an open PR is not published and alerts", async () => {
    gh.pulls = [{ ...must(gh.pulls[0]), merged_at: null, state: "open" }];
    await notPublished();
  });
  it("PST-10 a merged record that fails validation is not published and alerts", async () => {
    gh.assetBytesValue = new Uint8Array([9, 9, 9]);
    await notPublished();
  });
  it("P6 a bot merge from another workflow is not published", async () => {
    gh.runs.set(555, { ...must(gh.runs.get(555)), path: ".github/workflows/other.yml" });
    await notPublished();
  });
  it("P6 a squash commit without the trailer is not published", async () => {
    gh.commit = { sha: "c".repeat(40), message: "feat(posts): x" };
    await notPublished();
  });
});

describe("P6 hold", () => {
  it("P6 a hold label on the record PR publishes nothing, changes no state, and opens one alert", async () => {
    gh.pulls = [{ ...must(gh.pulls[0]), labels: ["hold"] }];
    await run(5);
    expect(ig.calls).toEqual([]);
    expect(yt.calls).toEqual([]);
    expect(await stateOf()).toBeUndefined();
    expect(store.commits).toEqual([]);
    expect(gh.alertIssues().map((i) => i.title)).toHaveLength(2);
    await run(20);
    expect(gh.alertIssues()).toHaveLength(2);
  });
  it("P6 a hold label on an open issue with the stem holds the post", async () => {
    gh.issues.push({
      number: 1,
      title: `Question about ${STEM}`,
      state: "open",
      labels: ["hold"],
      body: "",
    });
    await run(5);
    expect(ig.count("publish")).toBe(0);
    expect(yt.count("upload")).toBe(0);
  });
  it("P6 removing the hold inside the window lets the next run continue", async () => {
    gh.pulls = [{ ...must(gh.pulls[0]), labels: ["hold"] }];
    await run(5);
    gh.pulls = [{ ...must(gh.pulls[0]), labels: [] }];
    await run(20);
    expect(ig.count("publish")).toBe(1);
    expect(yt.count("upload")).toBe(1);
  });
  it("P6 a hold that is still there after the window ends makes the platform skipped", async () => {
    gh.pulls = [{ ...must(gh.pulls[0]), labels: ["hold"] }];
    await run(5);
    await run(95);
    expect((await stateOf())?.instagram?.status).toBe("skipped");
    expect(ig.count("publish")).toBe(0);
  });
  it("P6 a hold added after the container is queued stops media_publish and keeps the state queued", async () => {
    let calls = 0;
    gh.onGetPull = () => {
      calls++;
      if (calls >= 3) gh.pulls = [{ ...must(gh.pulls[0]), labels: ["hold"] }];
    };
    await run(
      5,
      {},
      makeRecord({ platforms: { instagram: must(makeRecord().platforms.instagram) } }),
    );
    expect(ig.count("create")).toBe(1);
    expect(ig.count("publish")).toBe(0);
    expect((await stateOf())?.instagram).toMatchObject({
      status: "queued",
      platform_id: "container-1",
    });
  });
  it("P6 a hold added after the YouTube queued commit undoes it and uploads nothing", async () => {
    let calls = 0;
    gh.onGetPull = () => {
      calls++;
      if (calls >= 3) gh.pulls = [{ ...must(gh.pulls[0]), labels: ["hold"] }];
    };
    await run(5, {}, makeRecord({ platforms: { youtube: must(makeRecord().platforms.youtube) } }));
    expect(yt.count("upload")).toBe(0);
    expect((await stateOf())?.youtube).toBeUndefined();
  });
});

describe("PST-15 AI label guard", () => {
  it("PST-15 ai_label true opens a reminder with the label step first and publishes nothing", async () => {
    await run(5, {}, makeRecord({ ai_label: true }));
    expect(ig.calls).toEqual([]);
    expect(yt.calls).toEqual([]);
    const reminder = gh.issues.find((i) => i.labels.includes("post-reminder"));
    expect(reminder?.body).toContain("set the AI label");
  });
});

describe("PST-18 and PST-25 failures", () => {
  it("PST-25 a failed upload opens exactly one alert in the same run and only that platform is retried", async () => {
    ig.createFails = new ApiError("Instagram", 400, "100");
    await run(5);
    expect(gh.alertIssues().filter((i) => i.title.includes("(instagram)"))).toHaveLength(1);
    expect(yt.count("upload")).toBe(1);
    await run(20);
    await run(35);
    expect(ig.count("create")).toBe(3);
    expect(yt.count("upload")).toBe(1);
    expect(gh.alertIssues().filter((i) => i.title.includes("(instagram)"))).toHaveLength(1);
    expect((await stateOf())?.instagram).toMatchObject({
      status: "failed",
      attempts: 3,
      error: { http_status: 400, code: "100" },
    });
    await run(50);
    expect(ig.count("create")).toBe(3);
  });
  it("PST-18 the retry label allows one more attempt inside the window and is removed", async () => {
    ig.createFails = new ApiError("Instagram", 500, null);
    for (const m of [5, 20, 35]) await run(m);
    ig.createFails = null;
    gh.alertIssues()
      .find((i) => i.title.includes("(instagram)"))
      ?.labels.push("retry");
    await run(50);
    expect(ig.count("publish")).toBe(1);
    expect(gh.removedLabels).toContain("retry");
  });
  it("PST-18 outside the window the retry label is refused in a comment", async () => {
    ig.createFails = new ApiError("Instagram", 500, null);
    for (const m of [5, 20, 35]) await run(m);
    gh.alertIssues()
      .find((i) => i.title.includes("(instagram)"))
      ?.labels.push("retry");
    ig.createFails = null;
    await run(100);
    expect(ig.count("publish")).toBe(0);
    expect(gh.comments.join("\n")).toContain("cannot be retried");
  });
});

describe("PST-14a YouTube recovery", () => {
  const dead = {
    schema: 1 as const,
    platforms: {
      youtube: {
        status: "queued" as const,
        attempts: 1,
        platform_id: null,
        url: null,
        published_at: null,
        issue: null,
        error: null,
        metrics: null,
      },
    },
  };
  const ytOnly = () => makeRecord({ platforms: { youtube: must(makeRecord().platforms.youtube) } });

  it("PST-14a queued without a video id uploads nothing, becomes failed, and opens one alert", async () => {
    await store.write(STEM, dead);
    await run(20, {}, ytOnly());
    await run(35, {}, ytOnly());
    expect(yt.calls).toEqual([]);
    expect((await stateOf())?.youtube?.status).toBe("failed");
    const alerts = gh.alertIssues();
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.body).toContain(
      "Check YouTube Studio for this video. If it is not there, add the label `retry`.",
    );
  });
  it("PST-14a only the retry label starts a new upload", async () => {
    await store.write(STEM, dead);
    await run(20, {}, ytOnly());
    gh.alertIssues()[0]?.labels.push("retry");
    await run(35, {}, ytOnly());
    expect(yt.count("upload")).toBe(1);
    expect((await stateOf())?.youtube?.status).toBe("published");
  });
  it("PST-14a an upload that throws is failed with no automatic second upload", async () => {
    yt.uploadFails = new ApiError("YouTube", null, null);
    await run(5, {}, ytOnly());
    await run(20, {}, ytOnly());
    expect(yt.count("upload")).toBe(1);
    expect((await stateOf())?.youtube?.status).toBe("failed");
  });
  it("PST-14a a queued video id is only checked, never uploaded again", async () => {
    await store.write(STEM, {
      schema: 1,
      platforms: { youtube: { ...dead.platforms.youtube, platform_id: "yt-video-1" } },
    });
    await run(20, {}, ytOnly());
    expect(yt.count("upload")).toBe(0);
    expect((await stateOf())?.youtube?.status).toBe("published");
  });
});

describe("T16 record not merged", () => {
  it("P6 an open record PR at post time opens one post-alert record not merged", async () => {
    gh.openPulls = [{ ...must(gh.pulls[0]), number: 40, state: "open", merged_at: null }];
    gh.pullFiles.set(40, [
      { filename: "posts/2026/2026-11-26-restart-after-gap.json", status: "added" },
    ]);
    await run(5, {}, makeRecord({ date: "2030-01-01" }));
    await run(20, {}, makeRecord({ date: "2030-01-01" }));
    const alerts = gh.alertIssues();
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.body).toContain("not merged");
  });
});

describe("PST-11 dry run", () => {
  it("acceptance 13: a dry run prints the plan and writes and publishes nothing", async () => {
    await run(5, { dryRun: true });
    expect(gh.writes).toEqual([]);
    expect(store.commits).toEqual([]);
    expect(store.files.size).toBe(0);
    expect(ig.calls).toEqual([]);
    expect(yt.calls).toEqual([]);
    expect(log.join("\n")).toContain("would publish");
  });
  it("acceptance 13: a dry run of a missed slot and a failed approval writes nothing either", async () => {
    await run(120, { dryRun: true });
    gh.pulls = [];
    await run(5, { dryRun: true });
    expect(gh.writes).toEqual([]);
    expect(store.commits).toEqual([]);
  });
});

describe("PST-20 secrets in the output", () => {
  it("PST-20 no token, signed URL, session URI or query string is printed, and each is masked first", async () => {
    ig.publishFailsButPublishes = true;
    const printed: string[] = [];
    await run(5, { out: (l) => printed.push(l) });
    const masks = printed.filter((l) => l.startsWith("::add-mask::")).map((l) => l.slice(12));
    expect(masks).toEqual(
      expect.arrayContaining([SECRETS.signedUrl, SECRETS.ytAccess, SECRETS.session]),
    );
    const rest = printed.filter((l) => !l.startsWith("::add-mask::")).join("\n");
    for (const secret of Object.values(SECRETS)) expect(rest).not.toContain(secret);
    expect(rest).not.toMatch(/https?:\/\//);
    expect(rest).not.toContain("?");
    for (const issue of gh.issues) {
      for (const secret of Object.values(SECRETS)) expect(issue.body).not.toContain(secret);
    }
    for (const file of store.files.values()) {
      for (const secret of Object.values(SECRETS)) expect(file).not.toContain(secret);
    }
  });
  it("PST-20 an error log carries only the HTTP status and code", async () => {
    ig.createFails = new ApiError("Instagram", 400, "100");
    await run(5);
    expect(log.join("\n")).toContain("http_status=400, code=100");
  });
});
