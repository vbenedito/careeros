import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  blobRequest,
  listLedgerFiles,
  MAX_BLOB_BYTES,
  readLedgerFile,
  treeRequest,
} from "./github";

const TOKEN = "test-token-not-real";
const SHA = "a".repeat(40);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("ledger GitHub requests (ADM-08)", () => {
  it("ADM-08 the tree is listed once per GITHUB_CACHE_S (600) with a tag, at the spec URL", () => {
    const { url, init } = treeRequest(TOKEN);
    expect(url).toBe(
      "https://api.github.com/repos/vbenedito/careeros-ops/git/trees/main?recursive=1",
    );
    expect(init.next.revalidate).toBe(600);
    expect(init.cache).toBe("force-cache");
    expect(init.next.tags).toEqual(["ledger-tree"]);
    expect(init.method).toBeUndefined();
  });

  it("ADM-08 a file is fetched by its blob SHA and cached permanently (the key is the SHA)", () => {
    const { url, init } = blobRequest(TOKEN, SHA);
    expect(url).toBe(`https://api.github.com/repos/vbenedito/careeros-ops/git/blobs/${SHA}`);
    expect(init.next.revalidate).toBe(false);
    expect(init.cache).toBe("force-cache");
    expect(blobRequest(TOKEN, "b".repeat(40)).url).not.toBe(url);
  });

  it("ADM-08 the token is only in the Authorization header, never in the URL", () => {
    for (const { url, init } of [treeRequest(TOKEN), blobRequest(TOKEN, SHA)]) {
      expect(url).not.toContain(TOKEN);
      expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
      expect(JSON.stringify({ ...init, headers: undefined })).not.toContain(TOKEN);
    }
  });

  it("ADM-05 only ledger/**.json blobs are listed, by name under ledger/", async () => {
    const fetcher = vi.fn(async () =>
      json({
        tree: [
          { path: "README.md", type: "blob", sha: SHA },
          { path: "ledger", type: "tree", sha: SHA },
          { path: "ledger/2030/2030-01-02-a.json", type: "blob", sha: SHA },
          { path: "ledger/2030/notes.txt", type: "blob", sha: SHA },
          { path: "other/ledger/x.json", type: "blob", sha: SHA },
          { path: "ledger/2029/2029-12-31-a.json", type: "blob", sha: "b".repeat(40) },
        ],
      }),
    );
    const result = await listLedgerFiles(TOKEN, fetcher);
    expect(result).toEqual({
      ok: true,
      value: {
        files: [
          { name: "2029/2029-12-31-a.json", sha: "b".repeat(40) },
          { name: "2030/2030-01-02-a.json", sha: SHA },
        ],
        invalid: [],
      },
    });
  });

  it("ADM-08 a GitHub error keeps the HTTP status only; a network error has none", async () => {
    expect(
      await listLedgerFiles(TOKEN, async () => json({ message: "Bad credentials" }, 401)),
    ).toEqual({
      ok: false,
      status: 401,
    });
    expect(
      await readLedgerFile(TOKEN, SHA, async () => new Response("x", { status: 502 })),
    ).toEqual({
      ok: false,
      status: 502,
    });
    const fail = async () => Promise.reject(new Error(`connect ECONNREFUSED ${TOKEN}`));
    expect(await listLedgerFiles(TOKEN, fail)).toEqual({ ok: false, status: null });
    expect(await readLedgerFile(TOKEN, SHA, fail)).toEqual({ ok: false, status: null });
  });

  it("ADM-06 an entry with an unexpected SHA is listed as invalid, not dropped", async () => {
    const result = await listLedgerFiles(TOKEN, async () =>
      json({ tree: [{ path: "ledger/2030/odd.json", type: "blob", sha: "xyz" }] }),
    );
    expect(result).toEqual({ ok: true, value: { files: [], invalid: ["2030/odd.json"] } });
  });

  it("ADM-08 a truncated tree is unavailable, never a partial ledger", async () => {
    const result = await listLedgerFiles(TOKEN, async () => json({ truncated: true, tree: [] }));
    expect(result).toEqual({ ok: false, status: null, reason: "truncated" });
  });

  it("ADM-08 a 200 that is not the expected JSON is unreadable, not an HTTP status", async () => {
    expect(await listLedgerFiles(TOKEN, async () => new Response("<html>"))).toEqual({
      ok: false,
      status: null,
      reason: "unreadable",
    });
    expect(await listLedgerFiles(TOKEN, async () => json({ nope: 1 }))).toEqual({
      ok: false,
      status: null,
      reason: "unreadable",
    });
  });

  it("ADM-06 a file over the size cap reads as null (an invalid file)", async () => {
    const big = "x".repeat(MAX_BLOB_BYTES + 1);
    expect(await readLedgerFile(TOKEN, SHA, async () => new Response(big))).toEqual({
      ok: true,
      value: null,
    });
    expect(await readLedgerFile(TOKEN, SHA, async () => new Response("{}"))).toEqual({
      ok: true,
      value: "{}",
    });
    const declared = new Response("{}", {
      headers: { "content-length": String(MAX_BLOB_BYTES + 1) },
    });
    expect(await readLedgerFile(TOKEN, SHA, async () => declared)).toEqual({
      ok: true,
      value: null,
    });
  });
});
