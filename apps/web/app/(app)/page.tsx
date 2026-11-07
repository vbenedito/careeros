import { ExtensionStatus } from "@/components/app/extension-status";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { extensionId } from "@/lib/env";
import { getCurrentUser } from "@/lib/supabase/server";

// The metrics arrive with #23–#26 (period selector, cards, charts).
export default async function DashboardPage() {
  const user = await getCurrentUser();
  return (
    <>
      <PageHeader title="Dashboard" />
      <main className="flex flex-col gap-4 p-4 md:p-6">
        <Card>
          <CardHeader>
            <CardTitle>Getting started</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm">Your study time charts arrive here in the next updates.</p>
            <ExtensionStatus extensionId={extensionId()} userEmail={user?.email ?? null} />
          </CardContent>
        </Card>
      </main>
    </>
  );
}
