import { DOCS_MAP } from "@/app/admin/docs-map";
import { ScrollTable, TD, TH, TR, Unavailable } from "@/app/admin/panel-parts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { IssueDocsRow } from "@/lib/admin/docs-view";

type Props =
  | { rows: IssueDocsRow[]; unavailableNote?: undefined }
  | { rows?: undefined; unavailableNote: string | null };

const list = (items: string[]) => (items.length === 0 ? "None" : items.join(", "));

/** ADM-13: the fixed map, then the files and skills given per issue (from the ledger). */
export function DocsPanel(props: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle variant="section">Docs Claude sees</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">Fixed map</h3>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            {DOCS_MAP.map((g) => (
              <div key={g.title} className="flex flex-col gap-0.5">
                <dt className="font-medium">
                  {g.title} <span className="font-normal text-muted-foreground">· {g.when}</span>
                </dt>
                <dd>
                  <ul className="text-muted-foreground [overflow-wrap:anywhere]">
                    {g.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">Per issue (from the ledger)</h3>
          {props.rows === undefined ? (
            <Unavailable what="Ledger" note={props.unavailableNote} />
          ) : props.rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No issue records in the ledger yet.</p>
          ) : (
            <ScrollTable minWidth="min-w-[36rem]">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className={TH}>Issue</th>
                  <th className={TH}>Files</th>
                  <th className="py-2 font-medium">Skills</th>
                </tr>
              </thead>
              <tbody>
                {props.rows.map((row) => (
                  <tr key={row.issue} className={TR}>
                    <td className={TD}>#{row.issue}</td>
                    <td className={`${TD} [overflow-wrap:anywhere]`}>{list(row.files)}</td>
                    <td className="py-2 align-top [overflow-wrap:anywhere]">{list(row.skills)}</td>
                  </tr>
                ))}
              </tbody>
            </ScrollTable>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
