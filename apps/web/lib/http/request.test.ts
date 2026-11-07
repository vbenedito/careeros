import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { request } from "./request";

const schema = z.object({ tokenHash: z.string() }).strict();
const respond = (status: number, body: unknown) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  );

afterEach(() => vi.unstubAllGlobals());

describe("request", () => {
  it("returns the validated body and uses the given method", async () => {
    respond(200, { tokenHash: "abc" });
    expect(await request("/api/x", { method: "POST", schema })).toEqual({
      ok: true,
      data: { tokenHash: "abc" },
    });
    expect(fetch).toHaveBeenCalledWith("/api/x", { method: "POST" });
  });

  it("defaults to GET", async () => {
    respond(200, { tokenHash: "abc" });
    await request("/api/x", { schema });
    expect(fetch).toHaveBeenCalledWith("/api/x", { method: "GET" });
  });

  it("reports the status of a non-2xx response", async () => {
    respond(429, { error: "RATE_LIMITED" });
    expect(await request("/api/x", { schema })).toEqual({
      ok: false,
      status: 429,
      error: "RATE_LIMITED",
    });
    respond(500, {});
    expect(await request("/api/x", { schema })).toEqual({ ok: false, status: 500 });
  });

  it("sends a JSON body", async () => {
    respond(200, { tokenHash: "abc" });
    await request("/api/x", { method: "DELETE", json: { a: 1 }, schema });
    expect(fetch).toHaveBeenCalledWith("/api/x", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: '{"a":1}',
    });
  });

  it("treats an unexpected body as a failure", async () => {
    respond(200, { tokenHash: 1 });
    expect(await request("/api/x", { schema })).toEqual({ ok: false, status: 200 });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("not json", { status: 200 })),
    );
    expect(await request("/api/x", { schema })).toEqual({ ok: false, status: 200 });
  });

  it("reports a network error with a null status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new TypeError("offline"))),
    );
    expect(await request("/api/x", { schema })).toEqual({ ok: false, status: null });
  });
});
