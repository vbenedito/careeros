"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { reportClientError } from "@/lib/report-client-error";

/** ENV-11: friendly fallback for an unexpected error in a page; nothing sensitive is shown. */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Only the class name and digest reach the server log (no message, no PII).
  useEffect(() => reportClientError("page", error), [error]);
  return (
    <main className="flex min-h-[60svh] flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="text-sm text-muted-foreground">
        Try again. If it keeps happening, reload the page.
      </p>
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}
