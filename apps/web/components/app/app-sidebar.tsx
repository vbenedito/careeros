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
          CareerOS
        </span>
      </SidebarSection>
      <nav aria-label="Pages" className="flex-1">
        <SidebarSection>
          <SidebarItem
            href="/"
            label="Dashboard"
            icon={<LayoutDashboard />}
            active={pathname === "/"}
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

function Logo() {
  return (
    <svg aria-hidden="true" viewBox="0 0 128 128" className="size-7 shrink-0">
      <rect width="128" height="128" rx="28" className="fill-primary" />
      <circle
        cx="64"
        cy="64"
        r="36"
        fill="none"
        className="stroke-primary-foreground"
        strokeWidth="12"
      />
      <path
        d="M64 40 V64 L80 76"
        fill="none"
        className="stroke-primary-foreground"
        strokeWidth="12"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function UserMenu({ email }: { email: string }) {
  const initial = email.charAt(0).toUpperCase() || "?";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account menu"
        className="flex h-10 w-full items-center gap-3 rounded-md px-1.5 text-left text-sm hover:bg-muted"
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
          <DropdownMenuItem asChild>
            <button type="submit" className="w-full">
              <LogOut /> Sign out
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
