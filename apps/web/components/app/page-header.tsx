import type { ReactNode } from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeToggle } from "./theme-toggle";

/** DASH-03: page title · page actions (e.g. the period selector) · theme toggle. */
export function PageHeader({ title, actions }: { title: string; actions?: ReactNode }) {
  return (
    <header className="flex h-14 items-center gap-2 border-b border-border px-4">
      <SidebarTrigger className="-ml-2" />
      <h1 className="text-base font-semibold">{title}</h1>
      <div className="ml-auto flex items-center gap-2">
        {actions}
        <ThemeToggle />
      </div>
    </header>
  );
}
