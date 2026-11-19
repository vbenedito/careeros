import type { Metadata } from "next";
import type { ReactNode } from "react";
import { requireAdmin } from "@/lib/admin/guard";

/**
 * ADM-02..04: every request under /admin is checked on the server first, and rendered per
 * request (never cached). No title is set here: the 404 for everyone else must be the exact
 * page of an unknown path. The robots value equals the root layout's (LAND-07); it is repeated
 * so the admin pages stay noindex even if that default changes (ADM-03).
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdmin();
  return (
    <div className="mx-auto flex min-h-svh w-full max-w-5xl flex-col gap-4 p-4">{children}</div>
  );
}
