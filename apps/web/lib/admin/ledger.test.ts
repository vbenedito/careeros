import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { BLOB_CONCURRENCY, loadLedger, parseLedgerFiles } from "./ledger";

const TOKEN = "test-token-not-real";

/** Synthetic sessions (not from the private ledger). */
const session = (id: string, overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    schema: 1,
    session: id,
    date: id.slice(0, 10),
    goal: `goal ${id}`,
    corrects: null,
    main: { tokens: 100, measure: "estimate" },
    agents: [],
    ...overrides,
  });

describe("ledger parsing (ADM-06)", () => {
  it("ADM-06 an invalid file (bad JSON, bad schema, extra key) is listed by name and skipped", () => {
    const { sessions, invalid } = parseLedgerFiles([
      { name: "2030/2030-01-02-a.json", text: session("2030-01-02-a") },
      { name: "2030/broken.json", text: "{not json" },
      { name: "2030/2030-01-03-a.json", text: session("2030-01-03-a", { schema: 2 }) },
      { name: "2030/2030-01-04-a.json", text: session("2030-01-04-a", { extra: true }) },
    ]);
    expect(sessions.map((s) => s.session)).toEqual(["2030-01-02-a"]);
    expect(invalid).toEqual([
      "2030/2030-01-03-a.json",
      "2030/2030-01-04-a.json",
      "2030/broken.json",
    ]);
  });
});

describe("ledger loading (ADM-08)", () => {
  const files = [
    { name: "2030/2030-01-02-a.json", sha: "a".repeat(40) },
    { name: "2030/bad.json", sha: "b".repeat(40) },
  ];
  const texts: Record<string, string> = {
    [files[0]?.sha ?? ""]: session("2030-01-02-a"),
    [files[1]?.sha ?? ""]: "nope",
  };

  it("ADM-08 without a token: unavailable, and GitHub is never called", async () => {
    const list = vi.fn();
    for (const token of [null, ""]) {
      expect(await loadLedger({ token, list })).toEqual({
        status: "unavailable",
        httpStatus: null,
      });
    }
    expect(list).not.toHaveBeenCalled();
  });

  it("ADM-08 a listing failure is unavailable with the HTTP status only", async () => {
    const result = await loadLedger({
      token: TOKEN,
      list: async () => ({ ok: false, status: 403 }),
    });
    expect(result).toEqual({ status: "unavailable", httpStatus: 403 });
  });

  it("ADM-08 a file failure is unavailable with its HTTP status", async () => {
    const result = await loadLedger({
      token: TOKEN,
      list: async () => ({ ok: true, value: { files, invalid: [] } }),
      read: async () => ({ ok: false, status: 404 }),
    });
    expect(result).toEqual({ status: "unavailable", httpStatus: 404 });
  });

  it("ADM-06 ADM-08 valid files become sessions, invalid ones are listed; the token is not in the result", async () => {
    const read = vi.fn(async (_token: string, sha: string) => ({
      ok: true as const,
      value: texts[sha] ?? "",
    }));
    const result = await loadLedger({
      token: TOKEN,
      list: async () => ({ ok: true, value: { files, invalid: [] } }),
      read,
    });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.sessions.map((s) => s.session)).toEqual(["2030-01-02-a"]);
    expect(result.invalid).toEqual(["2030/bad.json"]);
    expect(JSON.stringify(result)).not.toContain(TOKEN);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("ADM-08 a truncated or unreadable listing is unavailable with its reason, no status", async () => {
    for (const reason of ["truncated", "unreadable"] as const) {
      const result = await loadLedger({
        token: TOKEN,
        list: async () => ({ ok: false, status: null, reason }),
      });
      expect(result).toEqual({ status: "unavailable", httpStatus: null, reason });
    }
  });

  it("ADM-06 oversize files and unexpected SHAs are listed as invalid files", async () => {
    const result = await loadLedger({
      token: TOKEN,
      list: async () => ({
        ok: true,
        value: {
          files: [{ name: "2030/huge.json", sha: "c".repeat(40) }],
          invalid: ["2030/odd.json"],
        },
      }),
      read: async () => ({ ok: true, value: null }),
    });
    expect(result).toMatchObject({
      status: "ok",
      sessions: [],
      invalid: ["2030/huge.json", "2030/odd.json"],
    });
  });

  it("ADM-16 blobs are fetched at most BLOB_CONCURRENCY at a time", async () => {
    let running = 0;
    let peak = 0;
    const many = Array.from({ length: 30 }, (_, i) => ({
      name: `2030/f${i}.json`,
      sha: "d".repeat(40),
    }));
    await loadLedger({
      token: TOKEN,
      list: async () => ({ ok: true, value: { files: many, invalid: [] } }),
      read: async () => {
        running++;
        peak = Math.max(peak, running);
        await new Promise((r) => setTimeout(r, 2));
        running--;
        return { ok: true, value: session("2030-01-02-a") };
      },
    });
    expect(peak).toBe(BLOB_CONCURRENCY);
  });
});
