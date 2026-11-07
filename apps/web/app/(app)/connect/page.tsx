import { redirect } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { extensionId } from "@/lib/env";
import { getCurrentUser } from "@/lib/supabase/server";
import { ConnectExtension } from "./connect-extension";

export default async function ConnectPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?next=/connect");

  return (
    <>
      <PageHeader title="Connect the extension" />
      <main className="flex flex-col gap-4 p-4 md:p-6">
        <Card className="max-w-xl">
          <CardHeader>
            <p className="text-sm text-muted-foreground">
              The CareerOS extension gets its own sign-in for{" "}
              <strong className="text-foreground">{user.email}</strong>. Signing out here does not
              disconnect it.
            </p>
          </CardHeader>
          <CardContent>
            <ConnectExtension extensionId={extensionId()} userEmail={user.email ?? null} />
          </CardContent>
        </Card>
      </main>
    </>
  );
}
