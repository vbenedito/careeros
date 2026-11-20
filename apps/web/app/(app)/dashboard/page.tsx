import { cookies } from "next/headers";
import { ExtensionStatus } from "@/components/app/extension-status";
import { PageHeader } from "@/components/app/page-header";
import { ActivityChart } from "@/components/dashboard/activity-chart";
import { DashboardSkeleton } from "@/components/dashboard/dashboard-skeleton";
import { EmptyState } from "@/components/dashboard/empty-state";
import { LoadError } from "@/components/dashboard/load-error";
import { PeriodSelector } from "@/components/dashboard/period-selector";
import { PlatformChart } from "@/components/dashboard/platform-chart";
import { ProblemsAnnouncement } from "@/components/dashboard/problems-announcement";
import { ProblemsCard } from "@/components/dashboard/problems-card";
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
import { extensionFeatureLive, extensionId } from "@/lib/env";
import { loadProblemSetting, loadProblems } from "@/lib/problems/data";
import { showProblemsCard } from "@/lib/problems/settings";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

// ENV-05c: the gate reads EXTENSION_STORE_VERSION per request; never prerender this page.
export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string }>;
}) {
  const params = await searchParams;
  // PRB-23, ENV-05c: read per request (this page is dynamic). Not live in the store = the dashboard as before
  // problem tracking: no announcement, no card, and no setting read.
  const released = extensionFeatureLive("problemTracking");
  // ENV-05c: the NeetCode copy (title, site on each row) needs the later store version.
  const neetCode = released && extensionFeatureLive("problemTrackingNeetCode");
  const supabase = await createClient();
  const tzCookie = (await cookies()).get(TZ_COOKIE)?.value;
  let timeZone = resolveTimeZone(tzCookie);
  // No cookie yet = first visit (skeleton until the zone is known); an unusable one = UTC + hint.
  let tzStatus: TimeZoneStatus =
    tzCookie === undefined ? "unresolved" : isValidTimeZone(tzCookie) ? "viewer" : "fallback";
  let today = todayIn(timeZone);
  let period = resolvePeriod(params, today);
  let [user, result, problemSetting] = await Promise.all([
    getCurrentUser(),
    loadDashboard(supabase, period, today, timeZone),
    released ? loadProblemSetting(supabase) : Promise.resolve("unknown" as const),
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

  // DASH-17: the list comes after the zone is final; while the setting is off the card is hidden.
  const problems =
    released && result.ok && showProblemsCard(problemSetting)
      ? await loadProblems(supabase, period, timeZone, neetCode)
      : null;
  const problemsCard = problems ? (
    <ProblemsCard
      rows={problems.ok ? problems.rows : []}
      {...(problems.ok ? {} : { error: problems.reason })}
      retryHref={periodHref(period.view, period.anchor)}
      neetCode={neetCode}
    />
  ) : null;

  return (
    // DASH-07 (#70): a first visit shows the skeleton, not UTC days, until the zone is known.
    <TimeZoneGate status={tzStatus} skeleton={<DashboardSkeleton />}>
      <PageHeader title="Dashboard" actions={<PeriodSelector period={period} today={today} />} />
      <main className="flex flex-col gap-4 p-4 md:p-6">
        {/* DASH-18: only while the setting is off (not when it is on or could not be read). */}
        {released && problemSetting === "off" ? <ProblemsAnnouncement neetCode={neetCode} /> : null}
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
                {problemsCard}
                <ExtensionStatus extensionId={extensionId()} userEmail={user?.email ?? null} />
              </>
            ) : (
              <>
                <EmptyState extensionId={extensionId()} userEmail={user?.email ?? null} />
                {problemsCard}
              </>
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
