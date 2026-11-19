import { Unavailable } from "@/app/admin/panel-parts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GROUP_LABELS, PROGRESS_GROUPS, type ProgressView } from "@/lib/admin/progress-view";

type Props =
  | { view: ProgressView; checksUnknown?: number[]; unavailableNote?: undefined }
  | { view?: undefined; checksUnknown?: undefined; unavailableNote: string | null };

/** ADM-12: v1 issues in four groups, with counts and the list. */
export function ProgressPanel(props: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle variant="section">v1 progress</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {props.view === undefined ? (
          <Unavailable what="GitHub" note={props.unavailableNote} />
        ) : (
          <>
            {props.checksUnknown !== undefined && props.checksUnknown.length > 0 && (
              <p className="text-sm" role="status">
                Checks unknown for PR {props.checksUnknown.map((n) => `#${n}`).join(", ")}; counted
                as open.
              </p>
            )}
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {PROGRESS_GROUPS.map((g) => (
                <div key={g} className="flex flex-col gap-0.5">
                  <dt className="text-xs text-muted-foreground">{GROUP_LABELS[g]}</dt>
                  <dd className="text-lg font-semibold tabular-nums">{props.view[g].length}</dd>
                </div>
              ))}
            </dl>
            {PROGRESS_GROUPS.map((g) => (
              <div key={g} className="flex flex-col gap-1">
                <h3 className="text-sm font-medium">
                  {GROUP_LABELS[g]} <span className="tabular-nums">({props.view[g].length})</span>
                </h3>
                {props.view[g].length === 0 ? (
                  <p className="text-sm text-muted-foreground">None</p>
                ) : (
                  <ul className="flex flex-col gap-1 text-sm">
                    {props.view[g].map((item) => (
                      <li key={item.number} className="[overflow-wrap:anywhere]">
                        <span className="tabular-nums text-muted-foreground">#{item.number}</span>{" "}
                        {item.title}
                        {item.pr !== null && (
                          <span className="text-muted-foreground"> (PR #{item.pr})</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </>
        )}
      </CardContent>
    </Card>
  );
}
