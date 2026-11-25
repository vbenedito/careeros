import { describe, expect, it } from "vitest";
import { GitHubClient } from "./github.ts";
import {
  ContainerFailedError,
  ContainerPendingError,
  InstagramClient,
  instagramCaption,
} from "./instagram.ts";
import { ApiError, errorInfo, type FetchLike, mask } from "./mask.ts";
import { YoutubeClient, youtubeDescription } from "./youtube.ts";

interface Call {
  url: string;
  init: RequestInit;
}
/** A fetch stub that answers from a queue and records every call. */
function stub(...answers: (Response | Error)[]): { fetch: FetchLike; calls: Call[] } {
  const calls: Call[] = [];
  const fetch: FetchLike = async (url, init = {}) => {
    calls.push({ url, init });
    const next = answers.shift();
    if (!next) throw new Error("no answer queued");
    if (next instanceof Error) throw next;
    return next;
  };
  return { fetch, calls };
}
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });
const header = (call: Call | undefined, name: string): string | undefined =>
  (call?.init.headers as Record<string, string> | undefined)?.[name];

describe("PST-20 mask", () => {
  it("PST-20 prints ::add-mask:: and returns the value", () => {
    const lines: string[] = [];
    expect(mask("s3cret", (l) => lines.push(l))).toBe("s3cret");
    expect(lines).toEqual(["::add-mask::s3cret"]);
  });
  it("PST-20 refuses an empty value and a value with a line break", () => {
    expect(() => mask("", () => undefined)).toThrow();
    expect(() => mask("a\nb", () => undefined)).toThrow();
  });
  it("PST-20 an ApiError message holds only the HTTP status and code", () => {
    const error = new ApiError("GitHub", 403, "forbidden");
    expect(error.message).toBe("GitHub request failed (http_status=403, code=forbidden)");
    expect(errorInfo(new TypeError("fetch failed https://x?token=abc"))).toEqual({
      http_status: null,
      code: "TypeError",
    });
  });
});

describe("PST-10 GitHub client", () => {
  const make = (...answers: (Response | Error)[]) => {
    const s = stub(...answers);
    return {
      ...s,
      gh: new GitHubClient({
        repo: "o/r",
        token: "GHTOKEN",
        fetch: s.fetch,
        baseUrl: "http://stub.test/",
      }),
    };
  };

  it("PST-10 sends the token only in the Authorization header, to the injected base URL", async () => {
    const { gh, calls } = make(json([{ sha: "abc", commit: { message: "m" } }]));
    expect(await gh.lastCommitOfFile("posts/2026/x.json", "main")).toEqual({
      sha: "abc",
      message: "m",
    });
    expect(calls[0]?.url).toBe(
      "http://stub.test/repos/o/r/commits?path=posts%2F2026%2Fx.json&sha=main&per_page=1",
    );
    expect(header(calls[0], "Authorization")).toBe("Bearer GHTOKEN");
    expect(calls[0]?.url).not.toContain("GHTOKEN");
  });
  it("PST-14 reads the signed URL from the Location header without following the redirect", async () => {
    const { gh, calls } = make(
      new Response(null, { status: 302, headers: { Location: "https://objects.test/a?sig=1" } }),
    );
    expect(await gh.assetSignedUrl(9)).toBe("https://objects.test/a?sig=1");
    expect(calls[0]?.init.redirect).toBe("manual");
    expect(header(calls[0], "Accept")).toBe("application/octet-stream");
  });
  it("PST-14 downloads the asset bytes from the signed URL without the GitHub token, masking the URL first", async () => {
    const { gh, calls } = make(
      new Response(null, { status: 302, headers: { Location: "https://objects.test/a?sig=1" } }),
      new Response(new Uint8Array([1, 2, 3])),
    );
    const order: string[] = [];
    const bytes = await gh.assetBytes(9, (v) => {
      order.push(`mask ${v}`);
      return v;
    });
    expect([...bytes]).toEqual([1, 2, 3]);
    expect(order).toEqual(["mask https://objects.test/a?sig=1"]);
    expect(header(calls[1], "Authorization")).toBeUndefined();
  });
  it("PST-20 an HTTP error carries the status and code only", async () => {
    const { gh } = make(json({ error: "rate_limited", message: "secret text" }, 403));
    const error = await gh.getPull(1).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(String((error as Error).message)).not.toContain("secret text");
    expect(errorInfo(error).http_status).toBe(403);
  });
  it("PST-24 issues lists leave out pull requests", async () => {
    const { gh } = make(
      json([
        { number: 1, title: "a", state: "open", labels: [{ name: "x" }], body: "" },
        { number: 2, pull_request: {} },
      ]),
    );
    expect((await gh.listOpenIssues()).map((i) => i.number)).toEqual([1]);
  });
  it("PST-10 merges by squash with the head sha", async () => {
    const { gh, calls } = make(json({ merged: true }));
    await gh.mergePull(5, { sha: "h", title: "t", message: "m" });
    expect(calls[0]?.init.method).toBe("PUT");
    expect(JSON.parse(String(calls[0]?.init.body))).toMatchObject({
      sha: "h",
      merge_method: "squash",
    });
  });
  it("PST-10 refuses an empty token and a bad repo name", () => {
    const f = stub().fetch;
    expect(() => new GitHubClient({ repo: "o/r", token: "", fetch: f })).toThrow();
    expect(() => new GitHubClient({ repo: "nope", token: "t", fetch: f })).toThrow();
  });
});

describe("PST-14 Instagram client", () => {
  const make = (answers: (Response | Error)[], extra = {}) => {
    const s = stub(...answers);
    const ig = new InstagramClient({
      fetch: s.fetch,
      token: "IGTOKEN",
      userId: "1789",
      pollIntervalMs: 0,
      maxPolls: 3,
      sleep: async () => undefined,
      ...extra,
    });
    return { ...s, ig };
  };

  it("PST-14 creates a REELS container on v23.0 with the token in the header and the URL in the body", async () => {
    const { ig, calls } = make([json({ id: "c1" })]);
    expect(
      await ig.createReelContainer({ videoUrl: "https://signed.test/v?sig=1", caption: "hi" }),
    ).toBe("c1");
    expect(calls[0]?.url).toBe("https://graph.facebook.com/v23.0/1789/media");
    expect(header(calls[0], "Authorization")).toBe("Bearer IGTOKEN");
    const body = new URLSearchParams(String(calls[0]?.init.body));
    expect(Object.fromEntries(body)).toEqual({
      media_type: "REELS",
      video_url: "https://signed.test/v?sig=1",
      caption: "hi",
      share_to_feed: "true",
    });
  });
  it("PST-14 polls until FINISHED, then publishes and reads the permalink", async () => {
    const { ig, calls } = make([
      json({ status_code: "IN_PROGRESS" }),
      json({ status_code: "FINISHED" }),
      json({ id: "m1" }),
      json({ permalink: "https://www.instagram.com/reel/x/" }),
    ]);
    expect(await ig.waitUntilReady("c1")).toBe("FINISHED");
    expect(await ig.publish("c1")).toBe("m1");
    expect(await ig.permalink("m1")).toBe("https://www.instagram.com/reel/x/");
    expect(calls[0]?.url).toBe("https://graph.facebook.com/v23.0/c1?fields=status_code");
    expect(calls[2]?.url).toBe("https://graph.facebook.com/v23.0/1789/media_publish");
    expect(new URLSearchParams(String(calls[2]?.init.body)).get("creation_id")).toBe("c1");
  });
  it("PST-14 ERROR and EXPIRED are failures; a container that does not finish is pending", async () => {
    await expect(
      make([json({ status_code: "ERROR" })]).ig.waitUntilReady("c"),
    ).rejects.toBeInstanceOf(ContainerFailedError);
    const expired = await make([json({ status_code: "EXPIRED" })])
      .ig.waitUntilReady("c")
      .catch((e: unknown) => e);
    expect((expired as ContainerFailedError).status).toBe("EXPIRED");
    const slow = Array.from({ length: 3 }, () => json({ status_code: "IN_PROGRESS" }));
    await expect(make(slow).ig.waitUntilReady("c")).rejects.toBeInstanceOf(ContainerPendingError);
  });
  it("PST-14 reports a PUBLISHED container as published", async () => {
    expect(await make([json({ status_code: "PUBLISHED" })]).ig.containerStatus("c")).toBe(
      "PUBLISHED",
    );
  });
  it("PST-20 an API error carries the Graph error code only", async () => {
    const { ig } = make([json({ error: { code: 190, message: "Invalid token IGTOKEN" } }, 400)]);
    const error = await ig.publish("c").catch((e: unknown) => e);
    expect(errorInfo(error)).toEqual({ http_status: 400, code: "190" });
    expect((error as Error).message).not.toContain("IGTOKEN");
  });
  it("PST-14 builds the caption with hashtags and needs a numeric account id", () => {
    expect(instagramCaption({ caption: "c", hashtags: ["#a", "#b"] })).toBe("c\n\n#a #b");
    expect(instagramCaption({ caption: "c", hashtags: [] })).toBe("c");
    expect(() => new InstagramClient({ fetch: stub().fetch, token: "t", userId: "abc" })).toThrow();
  });
});

describe("PST-14a YouTube client", () => {
  const make = (...answers: (Response | Error)[]) => {
    const s = stub(...answers);
    return {
      ...s,
      yt: new YoutubeClient({
        fetch: s.fetch,
        clientId: "CID",
        clientSecret: "CSECRET",
        refreshToken: "REFRESH",
      }),
    };
  };

  it("PST-22 gets an access token from the refresh token", async () => {
    const { yt, calls } = make(json({ access_token: "ACCESS" }));
    expect(await yt.accessToken()).toBe("ACCESS");
    expect(calls[0]?.url).toBe("https://oauth2.googleapis.com/token");
    expect(Object.fromEntries(new URLSearchParams(String(calls[0]?.init.body)))).toEqual({
      client_id: "CID",
      client_secret: "CSECRET",
      refresh_token: "REFRESH",
      grant_type: "refresh_token",
    });
  });
  it("PST-14a starts a resumable upload with public status, not made for kids, and no publishAt", async () => {
    const { yt, calls } = make(
      new Response(null, { status: 200, headers: { Location: "https://upload.test/s?id=1" } }),
    );
    const session = await yt.startUpload("ACCESS", { title: "T", description: "D", size: 8 });
    expect(session).toBe("https://upload.test/s?id=1");
    expect(calls[0]?.url).toBe(
      "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
    );
    expect(header(calls[0], "Authorization")).toBe("Bearer ACCESS");
    const body = JSON.parse(String(calls[0]?.init.body));
    expect(body.snippet).toMatchObject({ title: "T", description: "D" });
    expect(body.status).toEqual({ privacyStatus: "public", selfDeclaredMadeForKids: false });
    expect(JSON.stringify(body)).not.toContain("publishAt");
    expect(JSON.stringify(body)).not.toContain("containsSyntheticMedia");
  });
  it("PST-14a puts the bytes to the session URI and returns the video id, then reads the status", async () => {
    const { yt, calls } = make(
      json({ id: "vid" }),
      json({ items: [{ status: { privacyStatus: "public", uploadStatus: "processed" } }] }),
      json({ items: [] }),
    );
    expect(await yt.upload("https://upload.test/s?id=1", new Uint8Array([1, 2]))).toBe("vid");
    expect(calls[0]?.init.method).toBe("PUT");
    expect(await yt.videoStatus("ACCESS", "vid")).toMatchObject({
      privacyStatus: "public",
      rejected: false,
    });
    expect(calls[1]?.url).toBe("https://www.googleapis.com/youtube/v3/videos?part=status&id=vid");
    expect(await yt.videoStatus("ACCESS", "vid")).toBeNull();
  });
  it("PST-20 a Google error carries the reason code only", async () => {
    const { yt } = make(
      json({ error: { errors: [{ reason: "quotaExceeded" }], message: "REFRESH leaked" } }, 403),
    );
    const error = await yt.accessToken().catch((e: unknown) => e);
    expect(errorInfo(error)).toEqual({ http_status: 403, code: "quotaExceeded" });
    expect((error as Error).message).not.toContain("REFRESH");
  });
  it("PST-14a the description is caption, hashtags and the text version", () => {
    expect(youtubeDescription({ caption: "c", hashtags: ["#a"], text_version: "t" })).toBe(
      "c\n\n#a\n\nt",
    );
  });
});

describe("H1 every request has a timeout", () => {
  it("PST-13 GitHub, Instagram and YouTube requests carry an abort signal", async () => {
    const signals: (AbortSignal | null | undefined)[] = [];
    const fetch: FetchLike = async (_url, init) => {
      signals.push(init?.signal);
      return json(
        { id: "x", status_code: "FINISHED", access_token: "t", items: [], permalink: "p" },
        200,
        { Location: "https://u.test/s" },
      );
    };
    const gh = new GitHubClient({ repo: "o/r", token: "t", fetch });
    await gh.getPull(1);
    const ig = new InstagramClient({ fetch, token: "t", userId: "1" });
    await ig.createReelContainer({ videoUrl: "u", caption: "c" });
    const yt = new YoutubeClient({ fetch, clientId: "a", clientSecret: "b", refreshToken: "c" });
    await yt.accessToken();
    await yt.startUpload("t", { title: "T", description: "D", size: 1 });
    await yt.upload("https://u.test/s", new Uint8Array([1]));
    await yt.videoStatus("t", "v");
    expect(signals).toHaveLength(6);
    for (const signal of signals) expect(signal).toBeInstanceOf(AbortSignal);
  });
});
