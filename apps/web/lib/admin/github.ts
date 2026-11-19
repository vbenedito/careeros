/**
 * ADM-08: GitHub REST reads of the private ledger repository, from the server only. The token
 * (`OPS_LEDGER_TOKEN`) goes into the `Authorization` header of these requests and nowhere else:
 * never logged, never returned to a caller, never in props. The `server-only` import turns an
 * import from a client component into a build error.
 */
import "server-only";
import { z } from "zod";
import { GITHUB_API, GITHUB_CACHE_S, LEDGER_DIR, LEDGER_REPO } from "./config";

/** `fetch` options with the Next.js data-cache fields. */
export type CachedRequestInit = RequestInit & {
  next: { revalidate: number | false; tags: string[] };
};

export interface GithubRequest {
  url: string;
  init: CachedRequestInit;
}

const headers = (token: string, accept: string) => ({
  Accept: accept,
  Authorization: `Bearer ${token}`,
  "X-GitHub-Api-Version": "2022-11-28",
});

/** The tree listing: one call per `GITHUB_CACHE_S` (ADM-08). */
export function treeRequest(token: string): GithubRequest {
  return {
    url: `${GITHUB_API}/repos/${LEDGER_REPO}/git/trees/main?recursive=1`,
    init: {
      headers: headers(token, "application/vnd.github+json"),
      cache: "force-cache",
      next: { revalidate: GITHUB_CACHE_S, tags: ["ledger-tree"] },
    },
  };
}

/** One file by its blob SHA: files never change (ADM-05), so the cache never expires. */
export function blobRequest(token: string, sha: string): GithubRequest {
  return {
    url: `${GITHUB_API}/repos/${LEDGER_REPO}/git/blobs/${sha}`,
    init: {
      // The raw media type returns the file's own bytes instead of base64 JSON.
      headers: headers(token, "application/vnd.github.raw+json"),
      cache: "force-cache",
      next: { revalidate: false, tags: ["ledger-blob"] },
    },
  };
}

const TreeSchema = z.object({
  tree: z.array(z.object({ path: z.string(), type: z.string(), sha: z.string() })),
});

export interface LedgerFileRef {
  /** Path under `LEDGER_DIR`, e.g. `2026/2026-11-18-a.json`. */
  name: string;
  sha: string;
}

export type GithubResult<T> =
  | { ok: true; value: T }
  /** `status` is the HTTP status, or null when no response arrived. Nothing else is kept. */
  | { ok: false; status: number | null };

type Fetcher = (url: string, init: CachedRequestInit) => Promise<Response>;

const SHA = /^[0-9a-f]{40}$/;

export async function listLedgerFiles(
  token: string,
  fetcher: Fetcher = fetch,
): Promise<GithubResult<LedgerFileRef[]>> {
  const { url, init } = treeRequest(token);
  let res: Response;
  try {
    res = await fetcher(url, init);
  } catch {
    return { ok: false, status: null };
  }
  if (!res.ok) return { ok: false, status: res.status };
  const parsed = TreeSchema.safeParse(await res.json().catch(() => null));
  if (!parsed.success) return { ok: false, status: res.status };
  const files = parsed.data.tree
    .filter(
      (e) =>
        e.type === "blob" &&
        e.path.startsWith(LEDGER_DIR) &&
        e.path.endsWith(".json") &&
        SHA.test(e.sha),
    )
    .map((e) => ({ name: e.path.slice(LEDGER_DIR.length), sha: e.sha }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { ok: true, value: files };
}

export async function readLedgerFile(
  token: string,
  sha: string,
  fetcher: Fetcher = fetch,
): Promise<GithubResult<string>> {
  const { url, init } = blobRequest(token, sha);
  try {
    const res = await fetcher(url, init);
    if (!res.ok) return { ok: false, status: res.status };
    return { ok: true, value: await res.text() };
  } catch {
    return { ok: false, status: null };
  }
}
