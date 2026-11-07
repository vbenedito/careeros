import { formatDuration } from "@careeros/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SummaryCard } from "@/lib/dashboard/summary";

/** DASH-06: one row ≥ lg, 1–3 columns responsive. */
export function SummaryCards({ cards }: { cards: SummaryCard[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((card) => (
        <Card key={card.id} aria-labelledby={`card-${card.id}`} data-testid={`card-${card.id}`}>
          <CardHeader>
            <CardTitle id={`card-${card.id}`}>{card.title}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            <p
              className="text-3xl font-semibold tabular-nums"
              data-testid={`card-${card.id}-value`}
            >
              {card.seconds === null ? "—" : formatDuration(card.seconds)}
            </p>
            {card.domain !== undefined && card.share !== undefined ? (
              <p
                className="flex min-w-0 gap-1 text-xs text-muted-foreground"
                data-testid={`card-${card.id}-detail`}
                data-value={card.detail ?? undefined}
              >
                <span className="truncate">{card.domain}</span>
                <span className="shrink-0">· {card.share}%</span>
              </p>
            ) : card.detail ? (
              <p
                className="truncate text-xs text-muted-foreground"
                data-testid={`card-${card.id}-detail`}
              >
                {card.detail}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
