import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { REQUIRED_CHECKS } from "./config";
import { checkRunsRequest, issuesRequest, loadRepo, MAX_PAGES, pullsRequest } from "./repo";

const TOKEN = "test-token-not-real";
const SHA = "a".repeat(40);
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("public repo reads (ADM-12)", () => {
  it("ADM-12 issues, PRs and check runs are GET reads of PUBLIC_REPO, cached GITHUB_CACHE_S, token in the header only", () => {
    const requests = [
      issuesRequest(TOKEN, 1),
      pullsRequest(TOKEN, 2),
      checkRunsRequest(TOKEN, SHA),
    ];
    for (const { url, init } of requests) {
      expect(url.startsWith("https://api.github.com/repos/vbenedito/careeros/")).toBe(true);
      expect(url).not.toContain(TOKEN);
      expect(init.method).toBeUndefined();
      expect(init.next.revalidate).toBe(600);
      expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
    }
    expect(issuesRequest(TOKEN, 1).url).toContain("labels=v1&state=all");
    expect(checkRunsRequest(TOKEN, SHA).url).toContain(`/commits/${SHA}/check-runs`);
  });

  const issuesBody = [
    { number: 1, title: "A", state: "open", labels: [{ name: "v1" }, { name: "blocked" }] },
    { number: 2, title: "B", state: "closed", labels: [{ name: "v1" }] },
    { number: 3, title: "a pull request", state: "open", labels: [], pull_request: {} },
  ];
  const pullsBody = [
    {
      number: 10,
      state: "open",
      draft: false,
      merged_at: null,
      body: "Closes #1",
      head: { sha: SHA },
    },
    {
      number: 11,
      state: "closed",
      merged_at: "2030-01-01T00:00:00Z",
      body: null,
      head: { sha: "b".repeat(40) },
    },
  ];
  const checksBody = {
    check_runs: REQUIRED_CHECKS.map((name) => ({ name, conclusion: "success" })),
  };

  const fetcherFor = (calls: string[]) => async (url: string) => {
    calls.push(url);
    if (url.includes("/issues?")) return json(issuesBody);
    if (url.includes("/pulls?")) return json(pullsBody);
    return json(checksBody);
  };

  it("ADM-12 loads issues (not PRs), PRs, and check runs only for open non-draft PRs that close an open v1 issue", async () => {
    const calls: string[] = [];
    const load = await loadRepo({ token: TOKEN, fetcher: fetcherFor(calls) });
    expect(load.status).toBe("ok");
    if (load.status !== "ok") return;
    expect(load.issues.map((i) => i.number)).toEqual([1, 2]);
    expect(load.issues[0]?.labels).toEqual(["v1", "blocked"]);
    expect(load.prs.map((p) => [p.number, p.merged])).toEqual([
      [10, false],
      [11, true],
    ]);
    expect(Object.keys(load.checks)).toEqual([SHA]);
    expect(calls.filter((u) => u.includes("check-runs"))).toHaveLength(1);
  });

  it("ADM-12 without the token nothing is fetched and the status is unavailable", async () => {
    const fetcher = vi.fn();
    expect(await loadRepo({ token: null, fetcher })).toEqual({
      status: "unavailable",
      httpStatus: null,
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("ADM-12 a GitHub error gives its HTTP status only; an unusable 200 is 'unreadable'", async () => {
    const failing = async () => json({ message: "Bad credentials", secret: TOKEN }, 401);
    const res = await loadRepo({ token: TOKEN, fetcher: failing });
    expect(res).toEqual({ status: "unavailable", httpStatus: 401 });
    expect(JSON.stringify(res)).not.toContain(TOKEN);
    const odd = await loadRepo({ token: TOKEN, fetcher: async () => json({ nope: true }) });
    expect(odd).toEqual({ status: "unavailable", httpStatus: null, reason: "unreadable" });
    const down = await loadRepo({
      token: TOKEN,
      fetcher: async () => Promise.reject(new Error(TOKEN)),
    });
    expect(down).toEqual({ status: "unavailable", httpStatus: null });
  });

  it("ADM-12 a failing check-runs read marks that PR 'checks unknown' and keeps the panel", async () => {
    const fetcher = async (url: string) =>
      url.includes("check-runs")
        ? json({}, 403)
        : url.includes("/issues?")
          ? json(issuesBody)
          : json(pullsBody);
    const load = await loadRepo({ token: TOKEN, fetcher });
    expect(load.status).toBe("ok");
    if (load.status === "ok") {
      expect(load.checksUnknown).toEqual([10]);
      expect(load.checks).toEqual({});
    }
  });

  it("ADM-12 a full page asks for the next one, up to MAX_PAGES", async () => {
    const full = Array.from({ length: 100 }, (_, i) => ({
      number: i + 1,
      title: "t",
      state: "closed",
      labels: [],
    }));
    const calls: string[] = [];
    const fetcher = async (url: string) => {
      calls.push(url);
      return json(url.includes("/issues?") ? full : []);
    };
    await loadRepo({ token: TOKEN, fetcher });
    expect(calls.filter((u) => u.includes("/issues?"))).toHaveLength(MAX_PAGES);
  });
});
