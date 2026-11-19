"use client";

import { ChevronsUpDown, LayoutDashboard, LogOut, Settings } from "lucide-react";
import { usePathname } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sidebar, SidebarItem, SidebarSection } from "@/components/ui/sidebar";

/** DASH-01: logo + Dashboard; bottom: Settings and the user menu. */
export function AppSidebar({ email }: { email: string }) {
  const pathname = usePathname();
  return (
    <Sidebar label="Main navigation">
      <SidebarSection className="h-14 flex-row items-center px-3">
        <Logo />
        <span className="font-semibold tracking-tight group-data-[state=collapsed]/sidebar:sr-only">
          Career<span className="text-primary">OS</span>
        </span>
      </SidebarSection>
      <nav aria-label="Pages" className="flex-1">
        <SidebarSection>
          <SidebarItem
            href="/dashboard"
            label="Dashboard"
            icon={<LayoutDashboard />}
            active={pathname === "/dashboard"}
          />
        </SidebarSection>
      </nav>
      <SidebarSection className="border-t border-border">
        <SidebarItem
          href="/settings"
          label="Settings"
          icon={<Settings />}
          active={pathname.startsWith("/settings")}
        />
        <UserMenu email={email} />
      </SidebarSection>
    </Sidebar>
  );
}

/** #225: the logo mark (direction C, small cut for 28 px); colours come from the brand tokens. */
function Logo() {
  return (
    <svg aria-hidden="true" viewBox="0 0 512 512" className="size-7 shrink-0">
      <rect width="512" height="512" rx="80" className="fill-brand" />
      <path
        d="M306.9 339.2A112 112 0 1 1 306.9 172.8"
        fill="none"
        className="stroke-brand-foreground"
        strokeWidth="84"
        strokeLinecap="round"
      />
      <circle cx="396" cy="256" r="58" className="fill-brand-foreground" />
    </svg>
  );
}

function UserMenu({ email }: { email: string }) {
  const initial = email.charAt(0).toUpperCase() || "?";
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        aria-label="Account menu"
        className="flex h-10 w-full touch:min-h-11 items-center gap-3 rounded-md px-1.5 text-left text-sm hover:bg-muted"
      >
        <span
          aria-hidden="true"
          className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
        >
          {initial}
        </span>
        <span
          className="flex-1 truncate group-data-[state=collapsed]/sidebar:sr-only"
          data-testid="user-email"
        >
          {email}
        </span>
        <ChevronsUpDown className="size-4 text-muted-foreground group-data-[state=collapsed]/sidebar:hidden" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-56">
        <DropdownMenuLabel className="truncate">{email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <form method="post" action="/auth/sign-out">
          {/* Keep the menu (and its form) mounted on select so the browser can submit it. */}
          <DropdownMenuItem asChild onSelect={(e) => e.preventDefault()}>
            <button type="submit" className="w-full">
              <LogOut /> Sign out
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
