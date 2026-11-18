"use client";

import { Switch as SwitchPrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/**
 * On/off switch (Radix, role="switch"). The button is the 44 px touch target on narrow screens
 * (TEST-01); the visible track inside it stays small. State is text elsewhere (the label and the
 * description), never colour alone.
 */
export function Switch({ className, ...props }: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "group inline-flex h-6 shrink-0 touch:h-11 touch:min-w-11 items-center justify-center rounded-full outline-none disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <span className="inline-flex h-6 w-11 items-center rounded-full border border-border bg-muted transition-colors group-focus-visible:ring-2 group-focus-visible:ring-ring group-data-[state=checked]:bg-primary">
        <SwitchPrimitive.Thumb className="block size-5 translate-x-0.5 rounded-full bg-background shadow-sm transition-transform data-[state=checked]:translate-x-[1.375rem]" />
      </span>
    </SwitchPrimitive.Root>
  );
}
