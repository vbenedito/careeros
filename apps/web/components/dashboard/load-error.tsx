import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import type { LoadErrorKind } from "@/lib/dashboard/load-error";

/**
 * DASH-11 error state (#70): a temporary failure offers a retry; a permanent one says that
 * retrying will not help, so it offers none.
 */
export function LoadError({ kind, retryHref }: { kind: LoadErrorKind; retryHref: string }) {
  return (
    <Card role="alert">
      <CardTitle>Couldn't load your study time</CardTitle>
      {kind === "temporary" ? (
        <>
          <p className="text-sm">
            The connection to the server failed. Your tracked time is safe. Try again in a moment.
          </p>
          <Button asChild variant="outline" size="sm" className="self-start">
            <a href={retryHref}>Try again</a>
          </Button>
        </>
      ) : (
        <p className="text-sm">
          Something on our side needs fixing, so trying again won't help yet. Your tracked time is
          safe. Check back later.
        </p>
      )}
    </Card>
  );
}
