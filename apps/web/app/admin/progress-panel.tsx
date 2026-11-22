import { StackedBar, type StackSegment } from "@/app/admin/charts";
import { Details, Unavailable } from "@/app/admin/panel-parts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  GROUP_LABELS,
  PROGRESS_GROUPS,
  type ProgressGroup,
  type ProgressView,
  progressHeadline,
} from "@/lib/admin/progress-view";

type Props =
  | { view: ProgressView; checksUnknown?: number[]; unavailableNote?: undefined }
  | { view?: undefined; checksUnknown?: undefined; unavailableNote: string | null };

/** Colours of the four groups (ADM-20.2): done, waiting, blocked, open. */
const GROUP_STYLE: Record<ProgressGroup, { fill: string; swatch: string }> = {
  done: { fill: "fill-success", swatch: "bg-success" },
  waiting: { fill: "fill-primary", swatch: "bg-primary" },
  blocked: { fill: "fill-warning", swatch: "bg-warning" },
  open: { fill: "fill-chart-6", swatch: "bg-chart-6" },
};

/** ADM-12, ADM-17: the progress card. One stacked bar, a headline, a legend, the lists in Details. */
export function ProgressPanel(props: Props) {
  const view = props.view;
  const headline = view === undefined ? null : progressHeadline(view);
  const segments: StackSegment[] =
    view === undefined
      ? []
      : PROGRESS_GROUPS.map((g) => ({
          key: g,
          label: GROUP_LABELS[g],
          count: view[g].length,
          ...GROUP_STYLE[g],
        }));
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle variant="section">v1 progress</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {view === undefined ? (
          <Unavailable what="GitHub" note={props.unavailableNote} />
        ) : (
          <>
            <p className="text-sm font-medium">{headline}</p>
            {props.checksUnknown !== undefined && props.checksUnknown.length > 0 && (
              <p className="text-sm" role="status">
                Checks unknown for PR {props.checksUnknown.map((n) => `#${n}`).join(", ")}; counted
                as open.
              </p>
            )}
            {segments.some((s) => s.count > 0) && (
              <StackedBar segments={segments} label={headline ?? ""} />
            )}
            <Details label="Details: issues">
              {PROGRESS_GROUPS.map((g) => (
                <div key={g} className="flex flex-col gap-1">
                  <h3 className="text-sm font-medium">
                    {GROUP_LABELS[g]} <span className="tabular-nums">({view[g].length})</span>
                  </h3>
                  {view[g].length === 0 ? (
                    <p className="text-sm text-muted-foreground">None</p>
                  ) : (
                    <ul className="flex flex-col gap-1 text-sm">
                      {view[g].map((item) => (
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
            </Details>
          </>
        )}
      </CardContent>
    </Card>
  );
}
