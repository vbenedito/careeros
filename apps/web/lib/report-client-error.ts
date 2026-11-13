/** Browser side of ENV-11: report an error-boundary hit to /api/client-error, never throwing. */
import { type ErrorReport, toErrorReport } from "@/lib/error-report";

export function reportClientError(source: ErrorReport["source"], error: unknown): void {
  try {
    void fetch("/api/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toErrorReport(source, error)),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Reporting must never make the error page itself fail.
  }
}
