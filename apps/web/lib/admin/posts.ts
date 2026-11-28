/**
 * ADM-21: reads the post records (`posts/YYYY/<stem>.json`, PST-04) and the pipeline state
 * (`posts-state/YYYY/<stem>.json`, PST-07) from the ops repository, with the same token, tree call
 * and blob cache as the ledger (ADM-08, ADM-16, PST-26). A file that is not valid JSON, fails its
 * schema or cannot be read is listed by name as invalid and skipped (as in ADM-06); the rest of
 * the card still shows. `posts-state/tokens.json` and any other file outside `YYYY/<stem>.json`
 * are not posts and are ignored. Read only (ADM-04).
 */
import "server-only";
import {
  type PostRecord,
  PostRecordSchema,
  type PostState,
  PostStateSchema,
} from "@careeros/shared";
import type { z } from "zod";
import { opsLedgerToken } from "@/lib/env";
import { POSTS_DIR, POSTS_STATE_DIR } from "./config";
import { type LedgerFileRef, listOpsFiles, readLedgerFile } from "./github";
import { BLOB_CONCURRENCY, mapLimit } from "./ledger";

/** `YYYY/<YYYY-MM-DD-slug>.json`; captures the stem. */
const POST_FILE = /^\d{4}\/(\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*)\.json$/;

export interface PostEntry {
  stem: string;
  record: PostRecord;
  /** `null` until the pipeline writes the state file. */
  state: PostState | null;
  /** The state file exists but is invalid or unreadable: the status is unknown, not "Scheduled". */
  stateInvalid: boolean;
}

export type PostsLoad =
  | { status: "ok"; posts: PostEntry[]; invalid: string[] }
  | { status: "unavailable"; httpStatus: number | null; reason?: "unreadable" | "truncated" };

type Parsed<T> = { ok: true; value: T } | { ok: false };

function parseJson<T>(text: string, schema: z.ZodType<T>): Parsed<T> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false };
  }
  const parsed = schema.safeParse(json);
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false };
}

/**
 * Pure: pairs records with their state by stem. Invalid names carry their folder
 * (`posts/2026/x.json`), sorted. A state without a record is ignored: there is nothing to show.
 * A record whose stem does not match its own `date` and `slug` is invalid (PST-09).
 */
export function parsePostFiles(
  records: readonly { name: string; text: string }[],
  states: readonly { name: string; text: string }[],
): { posts: PostEntry[]; invalid: string[] } {
  const invalid: string[] = [];
  const stateByStem = new Map<string, PostState>();
  const badStates = new Set<string>();
  for (const { name, text } of states) {
    const stem = POST_FILE.exec(name)?.[1];
    if (stem === undefined) continue;
    const parsed = parseJson(text, PostStateSchema);
    if (parsed.ok) stateByStem.set(stem, parsed.value);
    else {
      badStates.add(stem);
      invalid.push(`${POSTS_STATE_DIR}${name}`);
    }
  }
  const posts: PostEntry[] = [];
  for (const { name, text } of records) {
    const stem = POST_FILE.exec(name)?.[1];
    if (stem === undefined) continue;
    const parsed = parseJson(text, PostRecordSchema);
    if (!parsed.ok || `${parsed.value.date}-${parsed.value.slug}` !== stem) {
      invalid.push(`${POSTS_DIR}${name}`);
      continue;
    }
    posts.push({
      stem,
      record: parsed.value,
      state: stateByStem.get(stem) ?? null,
      stateInvalid: badStates.has(stem),
    });
  }
  return { posts, invalid: invalid.sort() };
}

interface Deps {
  token?: string | null;
  list?: typeof listOpsFiles;
  read?: typeof readLedgerFile;
}

type Listing = Awaited<ReturnType<typeof listOpsFiles>>;

const unavailable = (listing: Extract<Listing, { ok: false }>): PostsLoad => ({
  status: "unavailable",
  httpStatus: listing.status,
  ...(listing.reason ? { reason: listing.reason } : {}),
});

export async function loadPosts(deps: Deps = {}): Promise<PostsLoad> {
  const token = deps.token === undefined ? opsLedgerToken() : deps.token;
  if (!token) return { status: "unavailable", httpStatus: null };
  const list = deps.list ?? listOpsFiles;
  const read = deps.read ?? readLedgerFile;

  // Same request and cache entry twice (ADM-16): one tree call per GITHUB_CACHE_S.
  const [recordList, stateList] = await Promise.all([
    list(token, POSTS_DIR),
    list(token, POSTS_STATE_DIR),
  ]);
  if (!recordList.ok) return unavailable(recordList);
  if (!stateList.ok) return unavailable(stateList);

  const wanted = (files: LedgerFileRef[]) => files.filter((f) => POST_FILE.test(f.name));
  const readAll = (files: LedgerFileRef[]) =>
    mapLimit(wanted(files), BLOB_CONCURRENCY, async (file) => ({
      file,
      result: await read(token, file.sha),
    }));
  const [recordReads, stateReads] = await Promise.all([
    readAll(recordList.value.files),
    readAll(stateList.value.files),
  ]);
  // A file that cannot be read (or is over the size cap) gets empty text, so it is listed as an
  // invalid file by name and the rest of the card still shows; a state file that cannot be read
  // makes that post's status "unknown" (ADM-21).
  const texts = (reads: typeof recordReads) =>
    reads.map(({ file, result }) => ({
      name: file.name,
      text: result.ok ? (result.value ?? "") : "",
    }));
  const parsed = parsePostFiles(texts(recordReads), texts(stateReads));
  const badSha = [
    ...recordList.value.invalid.filter((n) => POST_FILE.test(n)).map((n) => `${POSTS_DIR}${n}`),
    ...stateList.value.invalid
      .filter((n) => POST_FILE.test(n))
      .map((n) => `${POSTS_STATE_DIR}${n}`),
  ];
  return { status: "ok", posts: parsed.posts, invalid: [...parsed.invalid, ...badSha].sort() };
}
