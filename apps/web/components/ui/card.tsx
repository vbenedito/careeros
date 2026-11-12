import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** shadcn/ui Card: tinted surface, subtle border, no heavy shadow. */
export function Card({ className, ...props }: ComponentProps<"section">) {
  return (
    <section
      className={cn(
        "flex flex-col gap-4 rounded-lg border border-border bg-card p-5 text-card-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1", className)} {...props} />;
}

/**
 * A card's heading, always an <h2> under the page's <h1>.
 * `label` (default): the quiet caption above a metric (dashboard cards).
 * `section`: a page section's title (Settings), so its <h3> sub-headings read below it (#78).
 */
export function CardTitle({
  className,
  variant = "label",
  ...props
}: ComponentProps<"h2"> & { variant?: "label" | "section" }) {
  return (
    <h2
      className={cn(
        variant === "section"
          ? "text-base font-semibold text-card-foreground"
          : "text-sm font-medium text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function CardContent({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn(className)} {...props} />;
}
