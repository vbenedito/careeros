import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppSidebar } from "@/components/app/app-sidebar";
import { SIDEBAR_COOKIE, SidebarProvider } from "@/components/ui/sidebar";
import { getCurrentUser } from "@/lib/supabase/server";

/** Signed-in shell (DASH-01..03): sidebar + page. The proxy guards these routes too (AUTH-03). */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  const defaultOpen = (await cookies()).get(SIDEBAR_COOKIE)?.value !== "false";

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <div className="flex min-h-svh">
        <AppSidebar email={user.email ?? "Account"} />
        <div className="flex min-w-0 flex-1 flex-col">{children}</div>
      </div>
    </SidebarProvider>
  );
}
