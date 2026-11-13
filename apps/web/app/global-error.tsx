"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/report-client-error";

/** ENV-11: last-resort fallback when the root layout itself fails (no styles available). */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Only the class name and digest reach the server log (no message, no PII).
  useEffect(() => reportClientError("global", error), [error]);
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 24, textAlign: "center" }}>
        <h1>Something went wrong</h1>
        <p>Try again. If it keeps happening, reload the page.</p>
        <button type="button" onClick={reset}>
          Try again
        </button>
      </body>
    </html>
  );
}
