import { redirect } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { AccountSettings } from "@/components/settings/account-settings";
import { ExtensionSettings } from "@/components/settings/extension-settings";
import { TrackedSites } from "@/components/settings/tracked-sites";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isRecentSignIn } from "@/lib/auth/recent-sign-in";
import { isAuthProvider } from "@/lib/auth/routes";
import { extensionId } from "@/lib/env";
import { providerLabel } from "@/lib/settings/account";
import { createClient } from "@/lib/supabase/server";

/** DASH-12..14. Data is loaded with the user's session (DASH-15, RLS applies). */
export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const [{ data: claims }, sites] = await Promise.all([
    supabase.auth.getClaims(),
    supabase.from("tracked_domains").select("id, domain").order("domain"),
  ]);
  const user = claims?.claims;
  if (!user) redirect("/sign-in");
  const email = typeof user.email === "string" ? user.email : "";
  const accountProvider = user.app_metadata?.provider;

  return (
    <>
      <PageHeader title="Settings" />
      <main className="flex max-w-3xl flex-col gap-4 p-4 md:p-6">
        <Card aria-labelledby="sites-title">
          <CardHeader>
            <CardTitle id="sites-title">Tracked sites</CardTitle>
          </CardHeader>
          <CardContent>
            {sites.error ? (
              <p role="alert" className="text-sm">
                Couldn't load your sites. Reload the page to try again.
              </p>
            ) : (
              <TrackedSites sites={sites.data} />
            )}
          </CardContent>
        </Card>
        <Card aria-labelledby="extension-title">
          <CardHeader>
            <CardTitle id="extension-title">Extension</CardTitle>
          </CardHeader>
          <CardContent>
            <ExtensionSettings extensionId={extensionId()} userEmail={email || null} />
          </CardContent>
        </Card>
        <Card aria-labelledby="account-title">
          <CardHeader>
            <CardTitle id="account-title">Account</CardTitle>
          </CardHeader>
          <CardContent>
            <AccountSettings
              email={email}
              provider={providerLabel(user.app_metadata?.provider)}
              deleteFailed={error === "delete"}
              recentSignIn={isRecentSignIn(user, Date.now())}
              reauthProviders={
                isAuthProvider(accountProvider) ? [accountProvider] : ["google", "github"]
              }
              reauthRequired={error === "reauth"}
            />
          </CardContent>
        </Card>
      </main>
    </>
  );
}
