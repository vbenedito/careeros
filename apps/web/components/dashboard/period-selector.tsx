import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { type Period, periodHref, type View } from "@/lib/dashboard/period";
import { cn } from "@/lib/utils";

/** DASH-04: Week / Month, previous / next, Today. Plain links: the URL is the state (DASH-05). */
export function PeriodSelector({ period, today }: { period: Period; today: string }) {
  const viewLink = (view: View, label: string) => (
    <a
      href={periodHref(view, view === period.view ? period.anchor : today)}
      aria-current={view === period.view ? "page" : undefined}
      className={cn(
        "rounded-sm px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground",
        view === period.view && "bg-background text-foreground shadow-sm",
      )}
    >
      {label}
    </a>
  );

  return (
    <nav aria-label="Period" className="flex items-center gap-1">
      <div className="mr-1 flex rounded-md bg-muted p-0.5">
        {viewLink("week", "Week")}
        {viewLink("month", "Month")}
      </div>
      <Button asChild variant="ghost" size="icon" className="size-8">
        <a href={periodHref(period.view, period.previous)} aria-label={`Previous ${period.view}`}>
          <ChevronLeft />
        </a>
      </Button>
      <span className="min-w-28 text-center text-sm font-medium" data-testid="period-label">
        {period.label}
      </span>
      {period.next ? (
        <Button asChild variant="ghost" size="icon" className="size-8">
          <a href={periodHref(period.view, period.next)} aria-label={`Next ${period.view}`}>
            <ChevronRight />
          </a>
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          disabled
          aria-label={`Next ${period.view}`}
        >
          <ChevronRight />
        </Button>
      )}
      {period.isCurrent ? null : (
        <Button asChild variant="outline" size="sm">
          <a href={periodHref(period.view, today)}>Today</a>
        </Button>
      )}
    </nav>
  );
}
