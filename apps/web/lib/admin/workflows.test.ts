import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { loadWorkflows, readRun, runsRequest } from "./workflows";

const TOKEN = "test-token-not-real";
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const runBody = (conclusion: string) => ({
  total_count: 1,
  workflow_runs: [
    {
      id: 99,
      name: "private-looking name",
      head_commit: { message: "a commit message", author: { email: "x@example.test" } },
      html_url: "https://example.test/run/99",
      status: "completed",
      conclusion,
      updated_at: "2030-01-20T10:00:00Z",
    },
  ],
});

describe("workflow run reads (ADM-18)", () => {
  it("ADM-18 ADM-08 the read is a cached GET of main's newest completed run, token in the header only", () => {
    const { url, init } = runsRequest(TOKEN, "smoke.yml", "completed");
    expect(url).toBe(
      "https://api.github.com/repos/vbenedito/careeros/actions/workflows/smoke.yml/runs?branch=main&status=completed&per_page=1",
    );
    expect(url).not.toContain(TOKEN);
    expect(init.method).toBeUndefined();
    expect(init.next.revalidate).toBe(600);
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
    expect(runsRequest(TOKEN, "backup.yml", "success").url).toContain("status=success");
  });

  it("ADM-18 only status, conclusion and updated_at are kept", async () => {
    const res = await readRun(TOKEN, "smoke.yml", "completed", async () =>
      json(runBody("success")),
    );
    expect(res).toEqual({
      ok: true,
      run: { status: "completed", conclusion: "success", updatedAt: "2030-01-20T10:00:00Z" },
    });
    expect(JSON.stringify(res)).not.toMatch(/commit|example\.test|private-looking/);
  });

  it("ADM-18 a workflow with no run gives null; a bad body or a failure gives an error for that row", async () => {
    expect(
      await readRun(TOKEN, "x.yml", "completed", async () => json({ workflow_runs: [] })),
    ).toEqual({ ok: true, run: null });
    expect(await readRun(TOKEN, "x.yml", "completed", async () => json({ nope: 1 }))).toEqual({
      ok: false,
      httpStatus: null,
    });
    expect(await readRun(TOKEN, "x.yml", "completed", async () => json({}, 500))).toEqual({
      ok: false,
      httpStatus: 500,
    });
    expect(
      await readRun(TOKEN, "x.yml", "completed", async () => {
        throw new Error("network");
      }),
    ).toEqual({ ok: false, httpStatus: null });
  });

  it("ADM-18 ADM-16 a 403 with the token falls back to an unauthenticated read; other errors do not", async () => {
    const seen: Array<string | undefined> = [];
    const fetcher = async (_url: string, init: RequestInit) => {
      const auth = (init.headers as Record<string, string>).Authorization;
      seen.push(auth);
      return auth ? json({}, 403) : json(runBody("failure"));
    };
    const res = await readRun(TOKEN, "smoke.yml", "completed", fetcher);
    expect(res).toMatchObject({ ok: true, run: { conclusion: "failure" } });
    expect(seen).toEqual([`Bearer ${TOKEN}`, undefined]);
    // The fallback can fail too (60 per hour per IP): that row says HTTP 403 or 429.
    expect(await readRun(TOKEN, "smoke.yml", "completed", async () => json({}, 403))).toEqual({
      ok: false,
      httpStatus: 403,
    });
    const calls: string[] = [];
    await readRun(TOKEN, "smoke.yml", "completed", async (url) => {
      calls.push(url);
      return json({}, 404);
    });
    expect(calls).toHaveLength(1);
  });

  it("ADM-18 ADM-16 seven requests per load: six workflows plus the backup's last good run", async () => {
    const calls: string[] = [];
    const load = await loadWorkflows({
      token: TOKEN,
      fetcher: async (url) => {
        calls.push(url);
        return json(runBody("success"));
      },
    });
    expect(calls).toHaveLength(7);
    expect(calls.filter((u) => u.includes("status=success"))).toHaveLength(1);
    expect(calls.filter((u) => u.includes("backup.yml"))).toHaveLength(2);
    expect(load.status).toBe("ok");
  });

  it("ADM-18 ADM-17 one failing workflow fails its own row only; a failed last-good read keeps the row", async () => {
    const load = await loadWorkflows({
      token: TOKEN,
      fetcher: async (url) => {
        if (url.includes("ci.yml")) return json({}, 502);
        if (url.includes("backup.yml") && url.includes("status=success")) return json({}, 500);
        return json(runBody("success"));
      },
    });
    if (load.status !== "ok") throw new Error("expected ok");
    const byFile = Object.fromEntries(load.inputs.map((i) => [i.file, i.result]));
    expect(byFile["ci.yml"]).toEqual({ ok: false, httpStatus: 502 });
    expect(byFile["smoke.yml"]).toMatchObject({ ok: true });
    expect(byFile["backup.yml"]).toMatchObject({ ok: true });
    expect(byFile["backup.yml"]).not.toHaveProperty("lastGood");
  });

  it("ADM-08 without a token nothing is read", async () => {
    const fetcher = vi.fn();
    expect(await loadWorkflows({ token: null, fetcher })).toEqual({ status: "unavailable" });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
