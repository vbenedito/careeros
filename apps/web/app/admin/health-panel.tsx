import { Check, TriangleAlert, X } from "lucide-react";
import { Details, ScrollTable, TD, TH, TR, Unavailable } from "@/app/admin/panel-parts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { HealthRow, HealthStatus, HealthView } from "@/lib/admin/health-view";

type Props =
  | { view: HealthView; unavailableNote?: undefined }
  | { view?: undefined; unavailableNote: string | null };

const ICON_CLASS = "size-4 shrink-0";
const STATUS_STYLE: Record<HealthStatus, { color: string; fill: string }> = {
  passing: { color: "text-success", fill: "fill-success" },
  failing: { color: "text-destructive", fill: "fill-destructive" },
  stale: { color: "text-warning", fill: "fill-warning" },
  cancelled: { color: "text-warning", fill: "fill-warning" },
  none: { color: "text-warning", fill: "fill-warning" },
  unknown: { color: "text-warning", fill: "fill-warning" },
};

/** ADM-18: every status has a word and an icon; colour is never the only signal. */
function StatusIcon({ status }: { status: HealthStatus }) {
  const color = STATUS_STYLE[status].color;
  if (status === "passing")
    return <Check aria-hidden="true" className={`${ICON_CLASS} ${color}`} />;
  if (status === "failing") return <X aria-hidden="true" className={`${ICON_CLASS} ${color}`} />;
  return <TriangleAlert aria-hidden="true" className={`${ICON_CLASS} ${color}`} />;
}

function AgeBar({ row }: { row: HealthRow }) {
  if (row.barPercent === null) return null;
  return (
    <svg
      role="img"
      aria-label={`Age ${row.age ?? "unknown"}, ${row.limit ?? ""}`}
      viewBox="0 0 100 4"
      preserveAspectRatio="none"
      className="block h-1.5 w-full"
    >
      <rect width={100} height={4} className="fill-muted" />
      <rect width={row.barPercent} height={4} className={STATUS_STYLE[row.status].fill}>
        <title>{`${row.age ?? ""}, ${row.limit ?? ""}`}</title>
      </rect>
    </svg>
  );
}

/** ADM-18: the last result of six workflows, one row each. Not a live probe of production. */
export function HealthPanel(props: Props) {
  const view = props.view;
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle variant="section">Production health</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {view === undefined ? (
          <Unavailable what="GitHub" note={props.unavailableNote} />
        ) : view.unavailable !== null ? (
          <Unavailable
            what="GitHub"
            note={
              view.unavailable.httpStatus === null ? null : `HTTP ${view.unavailable.httpStatus}`
            }
          />
        ) : (
          <>
            <p className="text-sm font-medium">{view.headline}</p>
            <ul className="flex flex-col">
              {view.rows.map((row) => (
                <li
                  key={row.file}
                  className="flex flex-col gap-1.5 border-b border-border py-2 first:pt-0 last:border-b-0"
                >
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <span className="text-sm font-medium">{row.name}</span>
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      <StatusIcon status={row.status} />
                      {row.word}
                      {row.httpNote !== null && ` (${row.httpNote})`}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {[row.age, row.limit ?? row.note].filter(Boolean).join(" · ")}
                  </p>
                  <AgeBar row={row} />
                  {row.lastGood !== null && (
                    <p className="text-xs text-muted-foreground">{row.lastGood}</p>
                  )}
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              The last result of each workflow on main, not a live check of production.
            </p>
            <Details label="Details: checks">
              <ScrollTable minWidth="min-w-[28rem]">
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className={TH}>Workflow</th>
                    <th className={TH}>Status</th>
                    <th className={TH}>Run finished</th>
                    <th className="py-2 font-medium">Limit</th>
                  </tr>
                </thead>
                <tbody>
                  {view.rows.map((row) => (
                    <tr key={row.file} className={TR}>
                      <td className={TD}>{row.name}</td>
                      <td className={TD}>
                        {row.word}
                        {row.httpNote !== null && ` (${row.httpNote})`}
                      </td>
                      <td className={`${TD} tabular-nums`}>{row.finished ?? "None"}</td>
                      <td className="py-2 align-top">{row.limit ?? "None"}</td>
                    </tr>
                  ))}
                </tbody>
              </ScrollTable>
            </Details>
          </>
        )}
      </CardContent>
    </Card>
  );
}
