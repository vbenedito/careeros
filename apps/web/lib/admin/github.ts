/**
 * ADM-08: GitHub REST reads of the private ledger repository, from the server only. The token
 * (`OPS_LEDGER_TOKEN`) goes into the `Authorization` header of these requests and nowhere else:
 * never logged, never returned to a caller, never in props. The `server-only` import turns an
 * import from a client component into a build error.
 */
import "server-only";
import { z } from "zod";
import { githubApiBase } from "@/lib/env";
import { GITHUB_API, GITHUB_CACHE_S, LEDGER_DIR, LEDGER_REPO } from "./config";

/** `fetch` options with the Next.js data-cache fields. */
export type CachedRequestInit = RequestInit & {
  next: { revalidate: number | false; tags: string[] };
};

export interface GithubRequest {
  url: string;
  init: CachedRequestInit;
}

export const githubHeaders = (token: string, accept: string) => ({
  Accept: accept,
  Authorization: `Bearer ${token}`,
  "X-GitHub-Api-Version": "2022-11-28",
});

/** The tree listing: one call per `GITHUB_CACHE_S` (ADM-08). */
export function treeRequest(token: string): GithubRequest {
  return {
    url: `${githubApiBase(GITHUB_API)}/repos/${LEDGER_REPO}/git/trees/main?recursive=1`,
    init: {
      headers: githubHeaders(token, "application/vnd.github+json"),
      cache: "force-cache",
      next: { revalidate: GITHUB_CACHE_S, tags: ["ledger-tree"] },
    },
  };
}

/** One file by its blob SHA: files never change (ADM-05), so the cache never expires. */
export function blobRequest(token: string, sha: string): GithubRequest {
  return {
    url: `${githubApiBase(GITHUB_API)}/repos/${LEDGER_REPO}/git/blobs/${sha}`,
    init: {
      // The raw media type returns the file's own bytes instead of base64 JSON.
      headers: githubHeaders(token, "application/vnd.github.raw+json"),
      cache: "force-cache",
      next: { revalidate: false, tags: ["ledger-blob"] },
    },
  };
}

const TreeSchema = z.object({
  truncated: z.boolean().optional(),
  tree: z.array(z.object({ path: z.string(), type: z.string(), sha: z.string() })),
});

/** A file larger than this is an invalid file, never parsed (ADM-06). */
export const MAX_BLOB_BYTES = 1_000_000;

export interface LedgerFileRef {
  /** Path under the listed folder, e.g. `2026/2026-11-18-a.json`. */
  name: string;
  sha: string;
}

export interface LedgerListing {
  files: LedgerFileRef[];
  /** Entries under the listed folder whose SHA is not a 40-digit hex id: listed as invalid files. */
  invalid: string[];
}

export type GithubResult<T> =
  | { ok: true; value: T }
  /**
   * `status` is the HTTP status, or null when no response arrived. `reason` tells a 200 that
   * could not be used: `unreadable` (the body is not the expected JSON) or `truncated` (GitHub
   * cut the tree short, so the ledger would be partial). Nothing else is kept.
   */
  | { ok: false; status: number | null; reason?: "unreadable" | "truncated" };

type Fetcher = (url: string, init: CachedRequestInit) => Promise<Response>;

const SHA = /^[0-9a-f]{40}$/;

export async function listLedgerFiles(
  token: string,
  fetcher: Fetcher = fetch,
): Promise<GithubResult<LedgerListing>> {
  return listOpsFiles(token, LEDGER_DIR, fetcher);
}

/**
 * The `.json` files under `dir` in the ops repository. Every folder uses the same tree request,
 * so the ledger and the posts (ADM-21) share one cached call per `GITHUB_CACHE_S` (ADM-16).
 */
export async function listOpsFiles(
  token: string,
  dir: string,
  fetcher: Fetcher = fetch,
): Promise<GithubResult<LedgerListing>> {
  const { url, init } = treeRequest(token);
  let res: Response;
  try {
    res = await fetcher(url, init);
  } catch {
    return { ok: false, status: null };
  }
  if (!res.ok) return { ok: false, status: res.status };
  const parsed = TreeSchema.safeParse(await res.json().catch(() => null));
  if (!parsed.success) return { ok: false, status: null, reason: "unreadable" };
  if (parsed.data.truncated) return { ok: false, status: null, reason: "truncated" };
  const files: LedgerFileRef[] = [];
  const invalid: string[] = [];
  for (const e of parsed.data.tree) {
    if (e.type !== "blob" || !e.path.startsWith(dir) || !e.path.endsWith(".json")) continue;
    const name = e.path.slice(dir.length);
    if (SHA.test(e.sha)) files.push({ name, sha: e.sha });
    else invalid.push(name);
  }
  files.sort((a, b) => a.name.localeCompare(b.name));
  return { ok: true, value: { files, invalid: invalid.sort() } };
}

/** The file's text, or `null` when it is larger than `MAX_BLOB_BYTES` (an invalid file). */
export async function readLedgerFile(
  token: string,
  sha: string,
  fetcher: Fetcher = fetch,
): Promise<GithubResult<string | null>> {
  const { url, init } = blobRequest(token, sha);
  try {
    const res = await fetcher(url, init);
    if (!res.ok) return { ok: false, status: res.status };
    if (Number(res.headers.get("content-length")) > MAX_BLOB_BYTES)
      return { ok: true, value: null };
    const text = await res.text();
    return { ok: true, value: Buffer.byteLength(text) > MAX_BLOB_BYTES ? null : text };
  } catch {
    return { ok: false, status: null };
  }
}
