import { HBar } from "@/app/admin/charts";
import { Details, ScrollTable, TD, TH, TR, Unavailable } from "@/app/admin/panel-parts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SkillsView } from "@/lib/admin/skills-view";

type Props =
  | { view: SkillsView; unavailableNote?: undefined }
  | { view?: undefined; unavailableNote: string | null };

/** ADM-19: skills used per kind of work, counted per agent record, on one shared scale. */
export function SkillsPanel(props: Props) {
  const view = props.view;
  return (
    <Card className="min-w-0 md:col-span-2">
      <CardHeader>
        <CardTitle variant="section">Skills used</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {view === undefined ? (
          <Unavailable what="Ledger" note={props.unavailableNote} />
        ) : view.empty || view.headline === null ? (
          <p className="text-sm text-muted-foreground">No skills recorded yet.</p>
        ) : (
          <>
            <p className="text-sm font-medium">{view.headline}</p>
            <div
              role="img"
              aria-label={view.headline}
              className="grid gap-x-6 gap-y-4 md:grid-cols-2"
            >
              {view.kinds.map((k) => (
                <div key={k.kind} className="flex min-w-0 flex-col gap-2">
                  <h3 className="text-sm font-medium">
                    {k.label}{" "}
                    <span className="font-normal text-muted-foreground tabular-nums">
                      ({k.records} {k.records === 1 ? "record" : "records"})
                    </span>
                  </h3>
                  {k.records === 0 ? (
                    <p className="text-sm text-muted-foreground">No records</p>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {k.bars.map((b) => (
                        <li key={b.label} className="flex flex-col gap-1">
                          <span className="text-sm [overflow-wrap:anywhere]">{b.label}</span>
                          <div className="flex items-center gap-2">
                            <HBar
                              value={b.count}
                              max={view.max}
                              fill={b.neutral ? "fill-chart-6" : "fill-chart-1"}
                              title={`${b.label}: ${b.count}`}
                            />
                            <span className="min-w-[2ch] text-right text-sm tabular-nums">
                              {b.count}
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
        {view !== undefined && !view.empty && (
          <Details label="Details: skills">
            {view.table.length === 0 ? (
              <p className="text-sm text-muted-foreground">No skills recorded yet.</p>
            ) : (
              <ScrollTable minWidth="min-w-[22rem]">
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className={TH}>Kind</th>
                    <th className={TH}>Skill</th>
                    <th className="py-2 text-right font-medium">Records</th>
                  </tr>
                </thead>
                <tbody>
                  {view.table.map((row) => (
                    <tr key={`${row.kind}/${row.skill}`} className={TR}>
                      <td className={TD}>{row.kind}</td>
                      <td className={`${TD} [overflow-wrap:anywhere]`}>{row.skill}</td>
                      <td className="py-2 text-right align-top tabular-nums">{row.records}</td>
                    </tr>
                  ))}
                </tbody>
              </ScrollTable>
            )}
          </Details>
        )}
      </CardContent>
    </Card>
  );
}
