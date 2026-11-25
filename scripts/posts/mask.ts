/**
 * PST-20: every value made at run time that grants access (access tokens, signed URLs,
 * upload-session URIs) is masked with `::add-mask::` before any other step uses it. Errors carry
 * only the HTTP status and the API error code; nothing else of a response is kept.
 */

/** One line of output (the CLI writes it to stdout, tests collect it). */
export type Out = (line: string) => void;

/** Prints `::add-mask::<value>` and returns the value, so a call site reads `mask(token, out)`. */
export function mask(value: string, out: Out): string {
  if (value === "") throw new Error("mask: empty value");
  if (/[\r\n]/.test(value)) throw new Error("mask: a value with a line break cannot be masked");
  out(`::add-mask::${value}`);
  return value;
}

/** An HTTP failure reduced to what PST-20 allows in a log, a state file or an issue. */
export class ApiError extends Error {
  readonly http_status: number | null;
  readonly code: string | null;
  constructor(service: string, http_status: number | null, code: string | null) {
    super(
      `${service} request failed (http_status=${http_status ?? "none"}, code=${code ?? "none"})`,
    );
    this.name = "ApiError";
    this.http_status = http_status;
    this.code = code;
  }
}

/** The `{http_status, code}` of any error (a network error has neither). */
export function errorInfo(error: unknown): { http_status: number | null; code: string | null } {
  if (error instanceof ApiError) return { http_status: error.http_status, code: error.code };
  return { http_status: null, code: error instanceof Error ? error.name.slice(0, 40) : "unknown" };
}

/** A fetch-like function; tests pass a stub, the CLI passes the global `fetch`. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** A short code from a JSON error body of the common shapes; never the message text. */
export async function readErrorCode(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.json();
    const error = (body as { error?: unknown } | null)?.error;
    if (typeof error === "string") return safeCode(error);
    if (error && typeof error === "object") {
      const e = error as { code?: unknown; status?: unknown; errors?: { reason?: unknown }[] };
      const reason = e.errors?.[0]?.reason;
      for (const candidate of [reason, e.status, e.code]) {
        if (typeof candidate === "string" || typeof candidate === "number") {
          return safeCode(String(candidate));
        }
      }
    }
  } catch {
    // not JSON
  }
  return null;
}

/** Codes are short identifiers; anything else is dropped so no text of a body leaks. */
function safeCode(value: string): string | null {
  return /^[A-Za-z0-9_.:-]{1,64}$/.test(value) ? value : null;
}
