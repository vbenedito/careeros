import { PageHeader } from "@/components/app/page-header";
import { Skeleton } from "@/components/ui/skeleton";

/** Overrides the dashboard skeleton of the (app) group: /connect has no data to wait for. */
export default function ConnectLoading() {
  return (
    <>
      <PageHeader title="Connect the extension" />
      <main className="p-4 md:p-6" aria-busy="true">
        <Skeleton className="h-5 w-64" />
      </main>
    </>
  );
}
