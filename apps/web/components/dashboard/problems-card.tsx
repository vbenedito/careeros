import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { LoadErrorKind } from "@/lib/dashboard/load-error";
import { problemsCopy } from "@/lib/problems/copy";
import type { ProblemRow } from "@/lib/problems/list";

/**
 * DASH-17, PRB-11: time per problem for the selected period (name, total, last day), longest
 * first. From extension 0.3.1 (`neetCode`) it is titled "Coding problems" and shows the site on
 * every row; before that it reads as the LeetCode card. Same error states as DASH-11 (#70).
 */
export function ProblemsCard({
  rows,
  error,
  retryHref,
  neetCode = false,
}: {
  rows: readonly ProblemRow[];
  /** Set when the list could not be loaded. */
  error?: LoadErrorKind;
  retryHref: string;
  /** EXTENSION_FEATURES.problemTrackingNeetCode is live (ENV-05c). */
  neetCode?: boolean;
}) {
  const copy = problemsCopy(neetCode);
  return (
    <Card aria-labelledby="problems-title" data-testid="problems-card">
      <CardHeader>
        <CardTitle id="problems-title">{copy.cardTitle}</CardTitle>
        {copy.cardSubtitle ? (
          <p className="text-sm text-muted-foreground">{copy.cardSubtitle}</p>
        ) : null}
      </CardHeader>
      <CardContent>
        {error ? (
          <div role="alert" className="flex flex-col items-start gap-2 text-sm">
            <p>{error === "temporary" ? copy.cardLoadTemporary : copy.cardLoadPermanent}</p>
            {error === "temporary" ? (
              <Button asChild variant="outline" size="sm">
                <a href={retryHref}>Try again</a>
              </Button>
            ) : null}
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{copy.cardEmpty}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border" data-testid="problems-list">
            {rows.map((row) => (
              <li key={`${row.domain}/${row.slug}`} className="flex items-start gap-3 py-2 text-sm">
                {row.userRule ? (
                  <span className="min-w-0 flex-1 break-words" data-testid="problem-user-rule">
                    {row.userRule.label} ·{" "}
                    <span title={row.userRule.id} aria-label={row.userRule.id}>
                      <span className="sm:hidden" data-testid="problem-id-short">
                        {row.userRule.shortId}
                      </span>
                      <span className="hidden sm:inline" data-testid="problem-id-full">
                        {row.userRule.id}
                      </span>
                    </span>
                  </span>
                ) : (
                  <span className="min-w-0 flex-1 break-words">{row.title}</span>
                )}
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
