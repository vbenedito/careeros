import { cookies } from "next/headers";
import { ExtensionStatus } from "@/components/app/extension-status";
import { PageHeader } from "@/components/app/page-header";
import { PeriodSelector } from "@/components/dashboard/period-selector";
import { SummaryCards } from "@/components/dashboard/summary-cards";
import { TimeZoneSync } from "@/components/dashboard/time-zone-sync";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { loadDashboard } from "@/lib/dashboard/data";
import { resolvePeriod } from "@/lib/dashboard/period";
import { summarize } from "@/lib/dashboard/summary";
import { FALLBACK_TZ, resolveTimeZone, TZ_COOKIE, todayIn } from "@/lib/dashboard/time-zone";
import { extensionId } from "@/lib/env";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  let timeZone = resolveTimeZone((await cookies()).get(TZ_COOKIE)?.value);
  let today = todayIn(timeZone);
  let period = resolvePeriod(params, today);
  let [user, result] = await Promise.all([
    getCurrentUser(),
    loadDashboard(supabase, period, today, timeZone),
  ]);
  // DASH-07: a zone Node accepts but the database does not know falls back to UTC instead of
  // breaking the page for as long as the cookie lives.
  if (!result.ok && result.reason === "invalid-time-zone" && timeZone !== FALLBACK_TZ) {
    timeZone = FALLBACK_TZ;
    today = todayIn(timeZone);
    period = resolvePeriod(params, today);
    result = await loadDashboard(supabase, period, today, timeZone);
  }

  return (
    <>
      <TimeZoneSync />
      <PageHeader title="Dashboard" actions={<PeriodSelector period={period} today={today} />} />
      <main className="flex flex-col gap-4 p-4 md:p-6">
        {result.ok ? (
          <>
            <SummaryCards cards={summarize(result.data, period)} />
            {/* Charts arrive in #25–#26; empty/loading states and the Connect CTA in #28. */}
            <ExtensionStatus extensionId={extensionId()} userEmail={user?.email ?? null} />
          </>
        ) : (
          <Card role="alert">
            <CardTitle>Couldn't load your study time</CardTitle>
            <Button asChild variant="outline" size="sm" className="self-start">
              <a href={`/?view=${period.view}&date=${period.anchor}`}>Try again</a>
            </Button>
          </Card>
        )}
      </main>
    </>
  );
}
