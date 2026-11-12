import { beforeEach, describe, expect, it, vi } from "vitest";

const origin = vi.hoisted(() => ({ ok: true }));
vi.mock("@/lib/security/origin", () => ({ isSameOrigin: () => origin.ok }));

import { POST } from "./route";

const post = (body: string, headers: Record<string, string> = {}) =>
  POST(new Request("https://app.test/api/client-error", { method: "POST", body, headers }));

let logged: string[] = [];
beforeEach(() => {
  origin.ok = true;
  logged = [];
  vi.spyOn(console, "error").mockImplementation((line) => {
    logged.push(String(line));
  });
});

describe("POST /api/client-error (ENV-11)", () => {
  it("ENV-11 logs a coarse code, class name and digest", async () => {
    const res = await post(JSON.stringify({ source: "page", name: "TypeError", digest: "42" }));
    expect(res.status).toBe(204);
    expect(JSON.parse(logged[0] ?? "{}")).toEqual({
      level: "error",
      event: "client.error",
      code: "client_render_error",
      source: "page",
      name: "TypeError",
      digest: "42",
    });
  });

  it("ENV-11 rejects other origins, unknown fields, bad JSON and oversized bodies", async () => {
    origin.ok = false;
    expect((await post("{}")).status).toBe(403);
    origin.ok = true;
    expect((await post(JSON.stringify({ source: "page", message: "x" }))).status).toBe(400);
    expect((await post("not json")).status).toBe(400);
    expect((await post("x".repeat(600))).status).toBe(413);
    expect((await post("{}", { "content-length": "9999" })).status).toBe(413);
    expect(logged).toHaveLength(0);
  });

  it("ENV-11 is rate limited", async () => {
    const body = JSON.stringify({ source: "global" });
    const statuses: number[] = [];
    for (let i = 0; i < 40; i++) statuses.push((await post(body)).status);
    expect(statuses.filter((s) => s === 204).length).toBeLessThan(40);
    expect(statuses).toContain(429);
  });
});
