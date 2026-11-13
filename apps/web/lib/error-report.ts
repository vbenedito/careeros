/**
 * ENV-11: coarse error reports for the server log (no error tracking vendor). Only a source, an
 * error class name and Next.js's digest (an opaque hash that also appears in the server log of
 * the failing request) are accepted: never the message, stack, URL or any user input.
 */
import { z } from "zod";

/** Largest report body the endpoint reads, in bytes. */
export const MAX_REPORT_BYTES = 512;

export const ErrorReportSchema = z
  .object({
    source: z.enum(["page", "global"]),
    name: z
      .string()
      .regex(/^[A-Za-z][A-Za-z0-9_]{0,39}$/)
      .optional(),
    digest: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,40}$/)
      .optional(),
  })
  .strict();

export type ErrorReport = z.infer<typeof ErrorReportSchema>;

/** Browser side: the report for an error caught by an error boundary. */
export function toErrorReport(source: ErrorReport["source"], error: unknown): ErrorReport {
  const candidate = error as { name?: unknown; digest?: unknown } | null;
  const name = typeof candidate?.name === "string" ? candidate.name : "";
  const digest = typeof candidate?.digest === "string" ? candidate.digest : "";
  const report: ErrorReport = { source };
  if (ErrorReportSchema.shape.name.safeParse(name).success) report.name = name;
  if (ErrorReportSchema.shape.digest.safeParse(digest).success) report.digest = digest;
  return report;
}

/** Fixed-window limiter, per server instance (best effort: instances do not share it). */
export function createRateLimiter(max: number, windowMs: number, now: () => number = Date.now) {
  let windowStart = 0;
  let count = 0;
  return function allow(): boolean {
    const t = now();
    if (t - windowStart >= windowMs) {
      windowStart = t;
      count = 0;
    }
    count += 1;
    return count <= max;
  };
}

/** The fields `onRequestError` (instrumentation.ts) logs: no message, URL, headers or params. */
export function requestErrorFields(
  error: unknown,
  context: { routePath?: unknown; routeType?: unknown; routerKind?: unknown },
) {
  const candidate = error as { name?: unknown; digest?: unknown } | null;
  const short = (value: unknown, pattern: RegExp) =>
    typeof value === "string" && pattern.test(value) ? value : null;
  return {
    code: "request_error",
    name: short(candidate?.name, /^[A-Za-z][A-Za-z0-9_]{0,39}$/),
    digest: short(candidate?.digest, /^[A-Za-z0-9_-]{1,40}$/),
    // The route pattern (e.g. "/api/sites/[id]"), never the concrete URL.
    route: short(context.routePath, /^[A-Za-z0-9_/[\]().@-]{1,100}$/),
    routeType: short(context.routeType, /^[a-z-]{1,30}$/),
  };
}
