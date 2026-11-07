import type { InputHTMLAttributes } from "react";
import { cn } from "./cn";

/** Text field; pair it with a visible label or an `aria-label`. */
export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-8 w-full rounded-md border border-input bg-background px-2.5 text-sm placeholder:text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}
