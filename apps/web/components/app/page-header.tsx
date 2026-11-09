import type { ReactNode } from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeToggle } from "./theme-toggle";

/**
 * DASH-03: page title · page actions (e.g. the period selector) · theme toggle.
 * The header wraps by its own width (container query), not the window's: with the sidebar
 * open, a 1000 px window leaves less room than a 700 px one without it. When narrow, the
 * actions move to a second row so nothing ever overflows the page.
 */
export function PageHeader({ title, actions }: { title: string; actions?: ReactNode }) {
  return (
    <header className="@container/header border-b border-border">
      <div className="flex min-h-14 flex-wrap items-center gap-x-2 gap-y-1 px-4 py-2">
        <SidebarTrigger className="-ml-2" />
        <h1 className="truncate text-base font-semibold">{title}</h1>
        {actions ? (
          <div className="order-last flex w-full justify-center @2xl/header:order-none @2xl/header:ml-auto @2xl/header:w-auto">
            {actions}
          </div>
        ) : null}
        {/* Wide with actions: the actions take the free space (ml-auto) and the toggle follows. */}
        <div className={actions ? "ml-auto @2xl/header:order-last @2xl/header:ml-0" : "ml-auto"}>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
