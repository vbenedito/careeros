/**
 * ADM-05..08: reads the ledger. A file that is not valid JSON or fails the v1 schema is listed
 * by name as invalid and skipped, never shown half-read (ADM-06). A missing token or a GitHub
 * failure gives "unavailable" with the HTTP status only (ADM-08). The result never holds the
 * token.
 */
import "server-only";
import { type LedgerSession, LedgerSessionSchema } from "@careeros/shared";
import { opsLedgerToken } from "@/lib/env";
import { type LedgerFileRef, listLedgerFiles, readLedgerFile } from "./github";

export type LedgerLoad =
  | { status: "ok"; sessions: LedgerSession[]; invalid: string[] }
  | { status: "unavailable"; httpStatus: number | null };

/** Pure: validates the files' text. `invalid` is sorted by name. */
export function parseLedgerFiles(files: readonly { name: string; text: string }[]) {
  const sessions: LedgerSession[] = [];
  const invalid: string[] = [];
  for (const { name, text } of files) {
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      invalid.push(name);
      continue;
    }
    const parsed = LedgerSessionSchema.safeParse(json);
    if (parsed.success) sessions.push(parsed.data);
    else invalid.push(name);
  }
  return { sessions, invalid: invalid.sort() };
}

interface Deps {
  token?: string | null;
  list?: typeof listLedgerFiles;
  read?: typeof readLedgerFile;
}

export async function loadLedger(deps: Deps = {}): Promise<LedgerLoad> {
  const token = deps.token === undefined ? opsLedgerToken() : deps.token;
  if (!token) return { status: "unavailable", httpStatus: null };
  const list = deps.list ?? listLedgerFiles;
  const read = deps.read ?? readLedgerFile;

  const listing = await list(token);
  if (!listing.ok) return { status: "unavailable", httpStatus: listing.status };

  const reads = await Promise.all(
    listing.value.map(async (file: LedgerFileRef) => ({
      file,
      result: await read(token, file.sha),
    })),
  );
  const failed = reads.find((r) => !r.result.ok);
  if (failed && !failed.result.ok)
    return { status: "unavailable", httpStatus: failed.result.status };

  const files = reads.flatMap(({ file, result }) =>
    result.ok ? [{ name: file.name, text: result.value }] : [],
  );
  return { status: "ok", ...parseLedgerFiles(files) };
}
