import { PageHeader } from "@/components/app/page-header";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** DASH-11: settings skeleton while sites and account load. */
export default function SettingsLoading() {
  return (
    <>
      <PageHeader title="Settings" />
      <main className="flex max-w-3xl flex-col gap-4 p-4 md:p-6" aria-busy="true">
        <p role="status" className="sr-only">
          Loading settings…
        </p>
        {["sites", "extension", "account"].map((id) => (
          <Card key={id}>
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </Card>
        ))}
      </main>
    </>
  );
}
