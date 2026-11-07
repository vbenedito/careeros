import { formatDuration } from "@careeros/shared";
import { Card } from "../ui";

/** EXT-UI-01/04: the most prominent element. */
export function TodayCard({ seconds }: { seconds: number }) {
  return (
    <Card aria-label="Today">
      <p className="text-4xl font-semibold tabular-nums" data-testid="today-total">
        {formatDuration(seconds)}
      </p>
      <p className="text-xs text-muted-foreground">Today on this device</p>
    </Card>
  );
}
