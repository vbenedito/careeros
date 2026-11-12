/**
 * SYNC-06b (grill H5): a coarse, PII-free label for an unexpected error, for logs and the sync
 * status. Only the error's class name and a known machine code are used — never its message,
 * stack or any data it carries (they may hold tokens, emails or URLs, SEC-06).
 */
const SAFE_LABEL = /^[A-Za-z][A-Za-z0-9_]{0,47}$/;

export function errorKind(error: unknown): string {
  if (error === null || error === undefined) return "none";
  if (typeof error !== "object") return typeof error; // a thrown string or number: never its value
  const name = (error as { name?: unknown }).name;
  const code = (error as { code?: unknown }).code;
  const base = typeof name === "string" && SAFE_LABEL.test(name) ? name : "Error";
  return typeof code === "string" && SAFE_LABEL.test(code) ? `${base}:${code}` : base;
}
