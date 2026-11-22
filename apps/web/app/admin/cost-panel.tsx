import { LEDGER_MODELS } from "@careeros/shared";
import { CostChart } from "@/app/admin/charts";
import { Details, ScrollTable, TD, TH, TR, Unavailable } from "@/app/admin/panel-parts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CostView } from "@/lib/admin/cost-view";
import { CHART_DAYS, type DailyCostView } from "@/lib/admin/daily-view";
import { formatTokens } from "@/lib/admin/sessions-view";

type Props =
  | { daily: DailyCostView; view: CostView; unavailableNote?: undefined }
  | { daily?: undefined; view?: undefined; unavailableNote: string | null };

/**
 * ADM-10a, ADM-10: the agent cost card. The chart shows tokens per day by model; the Details hold
 * the table per day and the cost-per-issue table.
 */
export function CostPanel(props: Props) {
  return (
    <Card className="min-w-0 md:col-span-2">
      <CardHeader>
        <CardTitle variant="section">Agent cost</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {props.daily === undefined ? (
          <Unavailable what="Ledger" note={props.unavailableNote} />
        ) : (
          <>
            {props.daily.records === 0 ? (
              <p className="text-sm text-muted-foreground">
                No agent records in the last {CHART_DAYS} days.
              </p>
            ) : (
              <>
                <p className="text-sm font-medium">{props.daily.headline}</p>
                <CostChart view={props.daily} />
              </>
            )}
            <p className="text-sm text-muted-foreground">
              Main sessions are not in this chart: they are an estimate and not split by model
            </p>
            <Details label="Details: tokens per day">
              <ScrollTable minWidth="min-w-[26rem]">
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className={TH}>Date</th>
                    {LEDGER_MODELS.map((m) => (
                      <th key={m} className={`${TH} text-right`}>
                        {m}
                      </th>
                    ))}
                    <th className="py-2 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {props.daily.days.map((day) => (
                    <tr key={day.date} className={TR}>
                      <td className={`${TD} tabular-nums`}>{day.date}</td>
                      {LEDGER_MODELS.map((m) => (
                        <td key={m} className={`${TD} text-right tabular-nums`}>
                          {formatTokens(day.byModel[m])}
                        </td>
                      ))}
                      <td className="py-2 text-right align-top font-medium tabular-nums">
                        {formatTokens(day.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </ScrollTable>
              <h3 className="text-sm font-medium">Cost per issue</h3>
              {props.view.rows.length === 0 ? (
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
                          <td className={`${TD} text-right font-medium tabular-nums`}>
                            {row.total}
                          </td>
                          <td className="py-2 text-right align-top tabular-nums">{row.sessions}</td>
                        </tr>
                      ))}
                    </tbody>
                  </ScrollTable>
                  <p className="text-sm text-muted-foreground">
                    Main sessions (estimate):{" "}
                    <span className="tabular-nums">{props.view.main.tokens}</span> tokens, not split
                    across issues
                    {props.view.main.notMeasured > 0 &&
                      `; ${props.view.main.notMeasured} not measured`}
                    .
                  </p>
                </>
              )}
            </Details>
          </>
        )}
      </CardContent>
    </Card>
  );
}
