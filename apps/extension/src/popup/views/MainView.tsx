import type { PopupView } from "../../lib/popup-view";
import { ClockHint } from "../components/ClockHint";
import { CurrentSession } from "../components/CurrentSession";
import { StatusSection } from "../components/StatusSection";
import { SyncFooter } from "../components/SyncFooter";
import { TodayCard } from "../components/TodayCard";
import { TopSites } from "../components/TopSites";
import type { PopupData } from "../data";

/** Popup main view (spec 05 §2): layout only; every value comes from `buildPopupView`. */
export function MainView({
  view,
  data,
  onOpenSettings,
}: {
  view: PopupView;
  data: PopupData;
  onOpenSettings: () => void;
}) {
  return (
    <>
      <StatusSection status={view.status} data={data} onOpenSettings={onOpenSettings} />
      <TodayCard seconds={view.todaySeconds} />
      {view.current ? <CurrentSession {...view.current} /> : null}
      <TopSites sites={view.top} />
      {view.clockAheadMinutes !== null ? (
        <ClockHint minutes={view.clockAheadMinutes} deferred={view.deferred} />
      ) : null}
      <SyncFooter
        syncLabel={view.syncLabel}
        quarantined={view.quarantined}
        version={data.version}
        onOpenDashboard={() => data.openDashboard()}
      />
    </>
  );
}
