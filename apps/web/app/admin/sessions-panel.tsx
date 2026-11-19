import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SessionRow } from "@/lib/admin/sessions-view";

type Props =
  | { rows: SessionRow[]; invalid: string[]; unavailableNote?: undefined }
  | { rows?: undefined; invalid?: undefined; unavailableNote: string | null };

/** ADM-09: one row per session, newest first. Props are plain view-model values. */
export function SessionsPanel(props: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle variant="section">Sessions</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {props.rows === undefined ? (
          <p className="text-sm" role="status">
            Ledger unavailable
            {props.unavailableNote === null ? "" : ` (${props.unavailableNote})`}
          </p>
        ) : (
          <>
            {props.invalid.length > 0 && (
              <div className="flex flex-col gap-1 text-sm" role="status">
                <h3 className="font-medium text-warning">Invalid files, skipped</h3>
                <ul className="text-muted-foreground">
                  {props.invalid.map((name) => (
                    <li key={name}>{name}</li>
                  ))}
                </ul>
              </div>
            )}
            {props.rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sessions in the ledger yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[40rem] text-left text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr className="border-b border-border">
                      <th className="py-2 pr-3 font-medium">Date</th>
                      <th className="py-2 pr-3 font-medium">Goal</th>
                      <th className="py-2 pr-3 font-medium">Main tokens</th>
                      <th className="py-2 pr-3 font-medium">Agent tokens by model</th>
                      <th className="py-2 font-medium">Agents</th>
                    </tr>
                  </thead>
                  <tbody>
                    {props.rows.map((row) => (
                      <tr key={row.id} className="border-b border-border align-top last:border-b-0">
                        <td className="py-2 pr-3 tabular-nums">{row.date}</td>
                        <td className="py-2 pr-3">
                          {row.goal}
                          {row.corrects && (
                            <span className="block text-xs text-muted-foreground">
                              Corrects {row.corrects}
                            </span>
                          )}
                          {row.correctedBy.length > 0 && (
                            <span className="block text-xs text-muted-foreground">
                              Corrected by {row.correctedBy.join(", ")}
                            </span>
                          )}
                        </td>
                        <td className="py-2 pr-3 tabular-nums">
                          {row.mainTokens === null ? (
                            "Not measured"
                          ) : (
                            <>
                              {row.mainTokens}{" "}
                              <span className="text-xs text-muted-foreground">
                                {row.mainMeasure}
                              </span>
                            </>
                          )}
                        </td>
                        <td className="py-2 pr-3 tabular-nums">
                          {row.agentTokens.length === 0
                            ? "None"
                            : row.agentTokens.map((t) => `${t.model} ${t.tokens}`).join(" · ")}
                        </td>
                        <td className="py-2 tabular-nums">{row.agentCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
