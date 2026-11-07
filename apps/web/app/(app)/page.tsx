import { formatDuration } from "@careeros/shared";
import { cookies } from "next/headers";
import { ExtensionStatus } from "@/components/app/extension-status";
import { PageHeader } from "@/components/app/page-header";
import { PeriodSelector } from "@/components/dashboard/period-selector";
import { TimeZoneSync } from "@/components/dashboard/time-zone-sync";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { loadDashboard } from "@/lib/dashboard/data";
import { resolvePeriod } from "@/lib/dashboard/period";
import { resolveTimeZone, TZ_COOKIE, todayIn } from "@/lib/dashboard/time-zone";
import { extensionId } from "@/lib/env";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string }>;
}) {
  const timeZone = resolveTimeZone((await cookies()).get(TZ_COOKIE)?.value);
  const today = todayIn(timeZone);
  const period = resolvePeriod(await searchParams, today);
  const [user, result] = await Promise.all([
    getCurrentUser(),
    loadDashboard(await createClient(), period, today, timeZone),
  ]);

  return (
    <>
      <TimeZoneSync />
      <PageHeader title="Dashboard" actions={<PeriodSelector period={period} today={today} />} />
      <main className="flex flex-col gap-4 p-4 md:p-6">
        {result.ok ? (
          // Summary cards and charts replace this card in #24–#26.
          <Card>
            <CardHeader>
              <CardTitle>{period.label}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <p>
                Today:{" "}
                <strong data-testid="today-seconds">
                  {formatDuration(result.data.todaySeconds)}
                </strong>{" "}
                · Period:{" "}
                <strong data-testid="period-seconds">
                  {formatDuration(result.data.periodSeconds)}
                </strong>
              </p>
              <ExtensionStatus extensionId={extensionId()} userEmail={user?.email ?? null} />
            </CardContent>
          </Card>
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
