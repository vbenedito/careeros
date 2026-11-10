import type { PopupInput } from "../../lib/popup-view";
import { AccountSetting } from "../components/AccountSetting";
import { LocalDataSetting } from "../components/LocalDataSetting";
import { SitesSetting } from "../components/SitesSetting";
import { TrackingSetting } from "../components/TrackingSetting";
import type { PopupData } from "../data";
import { Button } from "../ui";

/** Settings view (spec 05 §3): tracking switch, tracked sites, account. Nothing else in v0. */
export function SettingsView({ input, data }: { input: Omit<PopupInput, "now">; data: PopupData }) {
  return (
    <div className="flex flex-col gap-4">
      <TrackingSetting enabled={input.trackingEnabled} onChange={data.setTracking} />
      <hr className="border-border" />
      {input.auth.connected ? (
        <>
          <SitesSetting
            sites={input.trackedDomains}
            onAdd={data.addSite}
            onRemove={data.removeSite}
          />
          <hr className="border-border" />
          <AccountSetting email={input.auth.email} onDisconnect={data.disconnect} />
        </>
      ) : (
        <>
          <section aria-label="Account" className="flex flex-col items-start gap-2">
            <p className="text-sm text-muted-foreground">
              Connect your account to manage your tracked sites.
            </p>
            <Button onClick={() => data.openDashboard("/connect")}>Connect account</Button>
          </section>
          {hasLocalData(input) ? (
            <>
              <hr className="border-border" />
              <LocalDataSetting pending={input.counts.pending} onForget={data.forgetLocalData} />
            </>
          ) : null}
        </>
      )}
    </div>
  );
}

/** Anything the last account left on this computer (#113). */
function hasLocalData(input: Omit<PopupInput, "now">): boolean {
  return (
    input.counts.pending > 0 ||
    input.counts.quarantined > 0 ||
    input.todayIntervals.length > 0 ||
    (input.trackedDomains?.length ?? 0) > 0
  );
}
