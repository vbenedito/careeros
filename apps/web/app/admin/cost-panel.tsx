import { LEDGER_MODELS } from "@careeros/shared";
import { ScrollTable, TD, TH, TR, Unavailable } from "@/app/admin/panel-parts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CostView } from "@/lib/admin/cost-view";

type Props =
  | { view: CostView; unavailableNote?: undefined }
  | { view?: undefined; unavailableNote: string | null };

/** ADM-10: tokens per issue by model, total and session count; main sessions on one line. */
export function CostPanel(props: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle variant="section">Cost per issue</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {props.view === undefined ? (
          <Unavailable what="Ledger" note={props.unavailableNote} />
        ) : props.view.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No agent records in the ledger yet.</p>
        ) : (
          <>
            <ScrollTable minWidth="min-w-[34rem]">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className={TH}>Issue</th>
                  {LEDGER_MODELS.map((m) => (
                    <th key={m} className={`${TH} text-right`}>
                      {m}
                    </th>
                  ))}
                  <th className={`${TH} text-right`}>Total</th>
                  <th className="py-2 text-right font-medium">Sessions</th>
                </tr>
              </thead>
              <tbody>
                {props.view.rows.map((row) => (
                  <tr key={row.label} className={TR}>
                    <td className={TD}>{row.label}</td>
                    {LEDGER_MODELS.map((m) => (
                      <td key={m} className={`${TD} text-right tabular-nums`}>
                        {row.byModel[m]}
                      </td>
                    ))}
                    <td className={`${TD} text-right font-medium tabular-nums`}>{row.total}</td>
                    <td className="py-2 text-right align-top tabular-nums">{row.sessions}</td>
                  </tr>
                ))}
              </tbody>
            </ScrollTable>
            <p className="text-sm text-muted-foreground">
              Main sessions (estimate):{" "}
              <span className="tabular-nums">{props.view.main.tokens}</span> tokens, not split
              across issues
              {props.view.main.notMeasured > 0 && `; ${props.view.main.notMeasured} not measured`}.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
