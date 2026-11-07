import { PageHeader } from "@/components/app/page-header";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** DASH-11: dashboard skeleton while the period's data loads (same layout as the page). */
export default function DashboardLoading() {
  return (
    <>
      <PageHeader title="Dashboard" />
      <main className="flex flex-col gap-4 p-4 md:p-6" aria-busy="true">
        <p role="status" className="sr-only">
          Loading your study time…
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {["today", "period", "top"].map((id) => (
            <Card key={id}>
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-9 w-28" />
            </Card>
          ))}
        </div>
        <div className="grid gap-4 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-64 w-full" />
          </Card>
          <Card>
            <Skeleton className="h-4 w-28" />
            <Skeleton className="mx-auto size-40 rounded-full" />
          </Card>
        </div>
      </main>
    </>
  );
}
