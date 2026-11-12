import { DashboardSkeleton } from "@/components/dashboard/dashboard-skeleton";

/** DASH-11: dashboard skeleton while the period's data loads (same layout as the page). */
export default function DashboardLoading() {
  return <DashboardSkeleton />;
}
