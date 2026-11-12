/**
 * POST /api/client-error { source, name?, digest? } → 204
 * ENV-11: lets the error pages (error.tsx, global-error.tsx) leave a trace in the Vercel runtime
 * log, without an error tracking vendor. Public (signed-out visitors see error pages too), so
 * it is strictly limited: same origin, ≤ 512 bytes, a fixed schema (no message, stack or URL)
 * and a per-instance rate limit. The log line carries only a coarse code, the error class name
 * and Next.js's digest.
 */
import { createRateLimiter, ErrorReportSchema, MAX_REPORT_BYTES } from "@/lib/error-report";
import { fail } from "@/lib/http/json";
import { logServerError } from "@/lib/log";
import { isSameOrigin } from "@/lib/security/origin";

const allow = createRateLimiter(30, 60_000);

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return fail(403, "FORBIDDEN");
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > MAX_REPORT_BYTES) return fail(413, "TOO_LARGE");
  if (!allow()) return fail(429, "RATE_LIMITED");

  const text = await request.text().catch(() => "");
  if (text.length > MAX_REPORT_BYTES) return fail(413, "TOO_LARGE");
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    // falls through to the schema check
  }
  const report = ErrorReportSchema.safeParse(body);
  if (!report.success) return fail(400, "INVALID_REPORT");

  logServerError("client.error", {
    code: "client_render_error",
    source: report.data.source,
    name: report.data.name ?? null,
    digest: report.data.digest ?? null,
  });
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
