import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// The metrics arrive with #23–#26 (period selector, cards, charts).
export default function DashboardPage() {
  return (
    <>
      <PageHeader title="Dashboard" />
      <main className="flex flex-col gap-4 p-4 md:p-6">
        <Card>
          <CardHeader>
            <CardTitle>Getting started</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-start gap-3 text-sm">
            <p>
              Your study time will appear here. Connect the extension in this browser to start
              tracking.
            </p>
            <Button asChild size="sm">
              <a href="/connect">Connect the extension</a>
            </Button>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
