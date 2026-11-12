import { cookies } from "next/headers";
import { ExtensionStatus } from "@/components/app/extension-status";
import { PageHeader } from "@/components/app/page-header";
import { ActivityChart } from "@/components/dashboard/activity-chart";
import { DashboardSkeleton } from "@/components/dashboard/dashboard-skeleton";
import { EmptyState } from "@/components/dashboard/empty-state";
import { LoadError } from "@/components/dashboard/load-error";
import { PeriodSelector } from "@/components/dashboard/period-selector";
import { PlatformChart } from "@/components/dashboard/platform-chart";
import { SummaryCards } from "@/components/dashboard/summary-cards";
import { TimeZoneGate, type TimeZoneStatus, UtcHint } from "@/components/dashboard/time-zone-sync";
import { activityBars } from "@/lib/dashboard/activity";
import { loadDashboard } from "@/lib/dashboard/data";
import { periodHref, resolvePeriod } from "@/lib/dashboard/period";
import { platformSlices } from "@/lib/dashboard/platforms";
import { summarize } from "@/lib/dashboard/summary";
import {
  FALLBACK_TZ,
  isValidTimeZone,
  resolveTimeZone,
  TZ_COOKIE,
  todayIn,
} from "@/lib/dashboard/time-zone";
import { extensionId } from "@/lib/env";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const tzCookie = (await cookies()).get(TZ_COOKIE)?.value;
  let timeZone = resolveTimeZone(tzCookie);
  // No cookie yet = first visit (skeleton until the zone is known); an unusable one = UTC + hint.
  let tzStatus: TimeZoneStatus =
    tzCookie === undefined ? "unresolved" : isValidTimeZone(tzCookie) ? "viewer" : "fallback";
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
    tzStatus = "fallback";
  }

  return (
    // DASH-07 (#70): a first visit shows the skeleton, not UTC days, until the zone is known.
    <TimeZoneGate status={tzStatus} skeleton={<DashboardSkeleton />}>
      <PageHeader title="Dashboard" actions={<PeriodSelector period={period} today={today} />} />
      <main className="flex flex-col gap-4 p-4 md:p-6">
        <UtcHint />
        {result.ok ? (
          <>
            <SummaryCards cards={summarize(result.data, period)} />
            {result.data.periodSeconds > 0 ? (
              <>
                {/* DASH-10: ≥ xl bar chart col-span-2 and the donut beside it; stacked below. */}
                <div className="grid gap-4 xl:grid-cols-3">
                  <ActivityChart
                    className="xl:col-span-2"
                    bars={activityBars(result.data.daily, period, today)}
                  />
                  <PlatformChart slices={platformSlices(result.data.domains)} />
                </div>
                <ExtensionStatus extensionId={extensionId()} userEmail={user?.email ?? null} />
              </>
            ) : (
              <EmptyState extensionId={extensionId()} userEmail={user?.email ?? null} />
            )}
          </>
        ) : (
          <LoadError
            kind={result.reason === "permanent" ? "permanent" : "temporary"}
            retryHref={periodHref(period.view, period.anchor)}
          />
        )}
      </main>
    </TimeZoneGate>
  );
}
