import type { HTMLAttributes } from "react";
import { cn } from "./cn";

/** Tinted surface with a subtle border and no heavy shadow (EXT-UI-01). */
export function Card({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <section
      className={cn(
        "rounded-lg border border-border bg-card px-4 py-3 text-card-foreground",
        className,
      )}
      {...props}
    />
  );
}
