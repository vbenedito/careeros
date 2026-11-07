import type { PopupInput } from "../../lib/popup-view";
import { AccountSetting } from "../components/AccountSetting";
import { SitesSetting } from "../components/SitesSetting";
import { TrackingSetting } from "../components/TrackingSetting";
import type { PopupData } from "../data";

/** Settings view (spec 05 §3): tracking switch, tracked sites, account. Nothing else in v0. */
export function SettingsView({ input, data }: { input: Omit<PopupInput, "now">; data: PopupData }) {
  return (
    <div className="flex flex-col gap-4">
      <TrackingSetting enabled={input.trackingEnabled} onChange={data.setTracking} />
      <hr className="border-border" />
      <SitesSetting sites={input.trackedDomains} onAdd={data.addSite} onRemove={data.removeSite} />
      {input.auth.connected ? (
        <>
          <hr className="border-border" />
          <AccountSetting email={input.auth.email} onDisconnect={data.disconnect} />
        </>
      ) : null}
    </div>
  );
}
