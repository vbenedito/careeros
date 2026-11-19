import { ScrollTable, TD, TH, TR, Unavailable } from "@/app/admin/panel-parts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ReviewRow } from "@/lib/admin/reviews-view";

type Props =
  | { rows: ReviewRow[]; githubNote?: string | null; unavailableNote?: undefined }
  | { rows?: undefined; githubNote?: undefined; unavailableNote: string | null };

const STATE_LABEL: Record<ReviewRow["state"], string> = {
  merged: "Merged",
  open: "Open",
  draft: "Draft",
  closed: "Closed, not merged",
  unknown: "Unknown",
};

/** ADM-11: review rounds, HIGH and MEDIUM findings, reviewer model and merge state per PR. */
export function ReviewsPanel(props: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle variant="section">Reviews</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {props.rows === undefined ? (
          <Unavailable what="Ledger" note={props.unavailableNote} />
        ) : props.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No review records in the ledger yet.</p>
        ) : (
          <>
            {props.githubNote !== undefined && (
              <Unavailable what="Merge state" note={props.githubNote} />
            )}
            <ScrollTable minWidth="min-w-[32rem]">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className={TH}>PR</th>
                  <th className={`${TH} text-right`}>Rounds</th>
                  <th className={`${TH} text-right`}>HIGH</th>
                  <th className={`${TH} text-right`}>MEDIUM</th>
                  <th className={TH}>Reviewer</th>
                  <th className="py-2 font-medium">Merge state</th>
                </tr>
              </thead>
              <tbody>
                {props.rows.map((row) => (
                  <tr key={row.pr} className={TR}>
                    <td className={TD}>#{row.pr}</td>
                    <td className={`${TD} text-right tabular-nums`}>{row.rounds}</td>
                    <td className={`${TD} text-right tabular-nums`}>{row.high}</td>
                    <td className={`${TD} text-right tabular-nums`}>{row.medium}</td>
                    <td className={TD}>{row.reviewers.join(", ")}</td>
                    <td className="py-2 align-top">{STATE_LABEL[row.state]}</td>
                  </tr>
                ))}
              </tbody>
            </ScrollTable>
          </>
        )}
      </CardContent>
    </Card>
  );
}
