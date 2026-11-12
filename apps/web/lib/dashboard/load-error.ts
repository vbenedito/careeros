/**
 * DASH-11 error state (#70): is a failed dashboard load worth retrying?
 *
 * Temporary: the request never got an answer (PostgREST reports status 0), the server or a
 * proxy timed out or was overloaded (408, 429, 5xx), or the database said so (statement
 * timeout, too many connections, shutting down, schema cache still loading).
 * Permanent: the request itself was refused (other 4xx) or the database objects do not match
 * the app (missing function or table, no permission). A retry gives the same answer, so the
 * page offers none.
 */
export type LoadErrorKind = "temporary" | "permanent";

/** Postgres / PostgREST codes that a retry can fix. */
const TEMPORARY_CODES = new Set([
  "57014", // statement timeout
  "57P01", // admin shutdown
  "57P03", // cannot connect now
  "53300", // too many connections
  "40001", // serialization failure
  "40P01", // deadlock
  "PGRST000", // could not connect to the database
  "PGRST001", // internal connection error
  "PGRST002", // schema cache not loaded yet
  "PGRST003", // timed out waiting for a pool connection
]);

/** Codes that mean the app and the database disagree; retrying cannot help. */
const PERMANENT_CODES = new Set([
  "42883", // undefined function
  "42P01", // undefined table
  "42501", // insufficient privilege
  "PGRST202", // function not found in the schema cache
  "PGRST301", // JWT invalid
]);

export function classifyLoadError(error: { status?: number; code?: string }): LoadErrorKind {
  const code = error.code ?? "";
  if (TEMPORARY_CODES.has(code) || code.startsWith("08")) return "temporary"; // 08: connection
  if (PERMANENT_CODES.has(code)) return "permanent";
  const status = error.status ?? 0;
  if (status === 0 || status === 408 || status === 429 || status >= 500) return "temporary";
  if (status >= 400) return "permanent";
  // Unknown shape: offering a retry costs the viewer one click at most.
  return "temporary";
}
