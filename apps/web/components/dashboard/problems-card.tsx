import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { LoadErrorKind } from "@/lib/dashboard/load-error";
import type { ProblemRow } from "@/lib/problems/list";

/**
 * DASH-17, PRB-11: time per LeetCode problem for the selected period (name, total, last day),
 * longest first. Same error states as DASH-11 (#70).
 */
export function ProblemsCard({
  rows,
  error,
  retryHref,
}: {
  rows: readonly ProblemRow[];
  /** Set when the list could not be loaded. */
  error?: LoadErrorKind;
  retryHref: string;
}) {
  return (
    <Card aria-labelledby="problems-title" data-testid="problems-card">
      <CardHeader>
        <CardTitle id="problems-title">LeetCode problems</CardTitle>
      </CardHeader>
      <CardContent>
        {error ? (
          <div role="alert" className="flex flex-col items-start gap-2 text-sm">
            <p>
              {error === "temporary"
                ? "Couldn't load your LeetCode problems. Your tracked time is safe. Try again in a moment."
                : "Couldn't load your LeetCode problems. Trying again won't help yet. Check back later."}
            </p>
            {error === "temporary" ? (
              <Button asChild variant="outline" size="sm">
                <a href={retryHref}>Try again</a>
              </Button>
            ) : null}
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No LeetCode problems in this period.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border" data-testid="problems-list">
            {rows.map((row) => (
              <li key={row.slug} className="flex items-baseline gap-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate" title={row.name}>
                  {row.name}
                </span>
                <span className="shrink-0 tabular-nums" data-testid="problem-time">
                  {row.duration}
                </span>
                <time
                  dateTime={row.lastDay}
                  className="w-24 shrink-0 text-right text-xs text-muted-foreground"
                >
                  {row.lastDayLabel}
                </time>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
