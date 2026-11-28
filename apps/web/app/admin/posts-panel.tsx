import { Check, CircleHelp, Clock, ExternalLink, Hourglass, MinusCircle, X } from "lucide-react";
import { Details, ScrollTable, TD, TH, TR, Unavailable } from "@/app/admin/panel-parts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PostPlatformCell, PostsView } from "@/lib/admin/posts-view";

type Props =
  | { view: PostsView; unavailableNote?: undefined }
  | { view?: undefined; unavailableNote: string | null };

const ICON = "size-4 shrink-0";

/** ADM-21: a word and an icon for each status; colour is never the only signal. */
function StatusIcon({ status }: { status: PostPlatformCell["status"] }) {
  if (status === "published")
    return <Check aria-hidden="true" className={`${ICON} text-success`} />;
  if (status === "failed") return <X aria-hidden="true" className={`${ICON} text-destructive`} />;
  if (status === "skipped")
    return <MinusCircle aria-hidden="true" className={`${ICON} text-muted-foreground`} />;
  if (status === "queued")
    return <Hourglass aria-hidden="true" className={`${ICON} text-muted-foreground`} />;
  if (status === "unknown")
    return <CircleHelp aria-hidden="true" className={`${ICON} text-warning`} />;
  return <Clock aria-hidden="true" className={`${ICON} text-muted-foreground`} />;
}

function OpenLink({ cell, title }: { cell: PostPlatformCell; title: string }) {
  if (cell.url === null) return null;
  return (
    <a
      href={cell.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Open ${title} on ${cell.name} (opens in a new tab)`}
      className="inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      Open
      <ExternalLink aria-hidden="true" className="size-3.5" />
    </a>
  );
}

/** ADM-21: every post, newest first, one row per video with its networks. Read only (ADM-04). */
export function PostsPanel(props: Props) {
  const view = props.view;
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle variant="section">Posts</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {view === undefined ? (
          <Unavailable what="Posts" note={props.unavailableNote} />
        ) : (
          <>
            <p className="text-sm font-medium">{view.headline}</p>
            {view.rows.length > 0 && (
              <ul className="flex flex-col">
                {view.rows.map((row) => (
                  <li
                    key={row.stem}
                    className="flex flex-col gap-2 border-b border-border py-3 first:pt-0 last:border-b-0"
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium">{row.title}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">{row.when}</span>
                    </div>
                    <ul className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:gap-x-6">
                      {row.platforms.map((cell) => (
                        <li
                          key={cell.platform}
                          className="flex min-h-11 items-center gap-2 text-sm"
                        >
                          <span className="w-20 shrink-0 text-muted-foreground sm:w-auto">
                            {cell.name}
                          </span>
                          <span className="flex items-center gap-1.5 font-medium">
                            <StatusIcon status={cell.status} />
                            {cell.word}
                            {cell.httpNote !== null && ` (${cell.httpNote})`}
                          </span>
                          <OpenLink cell={cell} title={row.title} />
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
            {view.invalid.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Invalid {view.invalid.length === 1 ? "file" : "files"}, skipped:{" "}
                {view.invalid.join(", ")}
              </p>
            )}
            {view.rows.length > 0 && (
              <Details label="Details: posts">
                <ScrollTable minWidth="min-w-[36rem]">
                  <thead className="text-xs text-muted-foreground">
                    <tr className="border-b border-border">
                      <th className={TH}>Date</th>
                      <th className={TH}>File</th>
                      <th className={TH}>Network</th>
                      <th className={TH}>Status</th>
                      <th className={TH}>Live since</th>
                      <th className="py-2 font-medium">Link</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.rows.flatMap((row) =>
                      row.platforms.map((cell) => (
                        <tr key={`${row.stem}-${cell.platform}`} className={TR}>
                          <td className={`${TD} tabular-nums`}>{row.when}</td>
                          <td className={TD}>{row.stem}</td>
                          <td className={TD}>{cell.name}</td>
                          <td className={TD}>
                            {cell.word}
                            {cell.httpNote !== null && ` (${cell.httpNote})`}
                          </td>
                          <td className={`${TD} tabular-nums`}>{cell.publishedAt ?? "None"}</td>
                          <td className="py-2 align-top">
                            {cell.url === null ? (
                              "None"
                            ) : (
                              <OpenLink cell={cell} title={row.title} />
                            )}
                          </td>
                        </tr>
                      )),
                    )}
                  </tbody>
                </ScrollTable>
              </Details>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
