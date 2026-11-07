import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Tracked sites, extension and account settings arrive in #27.
export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" />
      <main className="flex flex-col gap-4 p-4 md:p-6">
        <Card>
          <CardHeader>
            <CardTitle>Coming next</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            Tracked sites, the extension connection and your account will be managed here.
          </CardContent>
        </Card>
      </main>
    </>
  );
}
