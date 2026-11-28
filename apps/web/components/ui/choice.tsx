import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Checkbox or radio with its label (native input, so keyboard and screen readers work as they
 * are). The whole row is the 44 px touch target on narrow screens (TEST-01); the box stays small.
 */
export function Choice({
  className,
  children,
  ...props
}: Omit<ComponentProps<"input">, "children"> & {
  type: "checkbox" | "radio";
  children: ReactNode;
}) {
  return (
    <label className={cn("flex touch:min-h-11 items-center gap-2 text-sm", className)}>
      <input className="size-4 shrink-0 accent-primary" {...props} />
      <span className="min-w-0">{children}</span>
    </label>
  );
}
