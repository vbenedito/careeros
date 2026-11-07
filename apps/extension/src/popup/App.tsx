import { useCallback, useEffect, useRef, useState } from "react";
import { buildPopupView, type PopupInput } from "../lib/popup-view";
import type { PopupData } from "./data";
import { MainView } from "./views/MainView";

/**
 * Popup shell: loads data, keeps the clock ticking and renders the current view
 * (docs/design-system.md: shell → views → components → ui primitives).
 */
export function App({ data, now = () => Date.now() }: { data: PopupData; now?: () => number }) {
  const [input, setInput] = useState<Omit<PopupInput, "now"> | null>(null);
  const [tick, setTick] = useState(now());
  const clock = useRef(now);
  clock.current = now;

  const reload = useCallback(() => {
    void data.load().then(setInput);
  }, [data]);

  useEffect(() => {
    const releaseFocus = data.holdFocus(); // first: before anything asks the worker to re-check
    reload();
    void data.refreshSites(); // SYNC-09: refresh on popup open
    const unsubscribe = data.subscribe(reload);
    // EXT-UI-02: live values update every second while the popup is open.
    const timer = setInterval(() => setTick(clock.current()), 1000);
    return () => {
      releaseFocus();
      unsubscribe();
      clearInterval(timer);
    };
  }, [data, reload]);

  return (
    <main className="flex flex-col gap-3 p-4">
      <header className="flex items-center justify-between">
        <span className="text-base font-semibold tracking-tight">CareerOS</span>
      </header>
      {input ? (
        <MainView view={buildPopupView({ ...input, now: tick })} data={data} />
      ) : (
        <p className="text-sm text-muted-foreground">Loading…</p>
      )}
    </main>
  );
}
