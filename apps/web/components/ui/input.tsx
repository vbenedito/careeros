import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** Text input with the shared focus ring and invalid state (`aria-invalid`). */
export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-9 w-full min-w-0 rounded-md border border-border bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring aria-[invalid=true]:border-destructive",
        className,
      )}
      {...props}
    />
  );
}
