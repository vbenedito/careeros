import { redirect } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { AccountSettings } from "@/components/settings/account-settings";
import { ExtensionSettings } from "@/components/settings/extension-settings";
import { ProblemsSetting } from "@/components/settings/problems-setting";
import { TrackedSites } from "@/components/settings/tracked-sites";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isRecentSignIn } from "@/lib/auth/recent-sign-in";
import { isAuthProvider } from "@/lib/auth/routes";
import { extensionFeatureLive, extensionId } from "@/lib/env";
import { problemsCopy } from "@/lib/problems/copy";
import { hasStoredProblems, loadProblemSetting } from "@/lib/problems/data";
import { isProblemDomainTracked } from "@/lib/problems/settings";
import { providerLabel } from "@/lib/settings/account";
import { createClient } from "@/lib/supabase/server";

// ENV-05c: the gate reads EXTENSION_STORE_VERSION per request; never prerender this page.
export const dynamic = "force-dynamic";

/**
 * DASH-12..14. Data is loaded with the user's session (DASH-15, RLS applies).
 * Heading outline (#78): h1 Settings → h2 per card → h3 inside a card (Delete account).
 */
export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();
  // PRB-23, ENV-05c: read per request (this page is dynamic). Not live in the store = no problems card and no
  // reads for it.
  const released = extensionFeatureLive("problemTracking");
  // ENV-05c: the NeetCode copy and the per-site check need the later store version.
  const neetCode = released && extensionFeatureLive("problemTrackingNeetCode");
  const copy = problemsCopy(neetCode);
  const [{ data: claims }, sites, problemSetting, storedProblems] = await Promise.all([
    supabase.auth.getClaims(),
    supabase.from("tracked_domains").select("id, domain").order("domain"),
    released ? loadProblemSetting(supabase) : Promise.resolve("unknown" as const),
    released ? hasStoredProblems(supabase) : Promise.resolve(false),
  ]);
  const user = claims?.claims;
  if (!user) redirect("/sign-in");
  const email = typeof user.email === "string" ? user.email : "";
  // AUTH-14: offer every provider linked to the account (the first one used is listed first).
  const linked = [user.app_metadata?.provider, ...(user.app_metadata?.providers ?? [])].filter(
    isAuthProvider,
  );
  const reauthProviders =
    linked.length > 0 ? [...new Set(linked)] : (["google", "github"] as const);

  return (
    <>
      <PageHeader title="Settings" />
      <main className="flex max-w-3xl flex-col gap-4 p-4 md:p-6">
        <Card aria-labelledby="sites-title">
          <CardHeader>
            <CardTitle id="sites-title" variant="section">
              Tracked sites
            </CardTitle>
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
        {released ? (
          <Card id="problems" aria-labelledby="problems-title" className="scroll-mt-4">
            <CardHeader>
              <CardTitle id="problems-title" variant="section">
                {copy.settingsTitle}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {problemSetting === "unknown" ? (
                <p role="alert" className="text-sm">
                  Couldn't load this setting. Reload the page to try again.
                </p>
              ) : (
                <ProblemsSetting
                  enabled={problemSetting === "on"}
                  hasStoredProblems={storedProblems}
                  neetCode={neetCode}
                  // When the sites could not load, do not claim a problem site is missing.
                  siteTracked={
                    sites.error
                      ? true
                      : isProblemDomainTracked(
                          sites.data.map((s) => s.domain),
                          neetCode,
                        )
                  }
                />
              )}
            </CardContent>
          </Card>
        ) : null}
        <Card aria-labelledby="extension-title">
          <CardHeader>
            <CardTitle id="extension-title" variant="section">
              Extension
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ExtensionSettings extensionId={extensionId()} userEmail={email || null} />
          </CardContent>
        </Card>
        <Card aria-labelledby="account-title">
          <CardHeader>
            <CardTitle id="account-title" variant="section">
              Account
            </CardTitle>
          </CardHeader>
          <CardContent>
            <AccountSettings
              email={email}
              provider={providerLabel(user.app_metadata?.provider)}
              deleteMismatch={error === "delete"}
              deleteFailed={error === "failed"}
              recentSignIn={isRecentSignIn(user, Date.now())}
              reauthProviders={reauthProviders}
              reauthRequired={error === "reauth"}
            />
          </CardContent>
        </Card>
      </main>
    </>
  );
}
