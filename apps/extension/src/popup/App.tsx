import { useCallback, useEffect, useRef, useState } from "react";
import { buildPopupView, type PopupInput } from "../lib/popup-view";
import type { PopupData } from "./data";
import { Button } from "./ui";
import { MainView } from "./views/MainView";
import { SettingsView } from "./views/SettingsView";

/**
 * Popup shell: loads data, keeps the clock ticking and renders the current view
 * (docs/design-system.md: shell → views → components → ui primitives).
 */
export function App({ data, now = () => Date.now() }: { data: PopupData; now?: () => number }) {
  const [input, setInput] = useState<Omit<PopupInput, "now"> | null>(null);
  const [screen, setScreen] = useState<"main" | "settings">("main");
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
        {screen === "main" ? (
          <>
            <span className="text-base font-semibold tracking-tight">CareerOS</span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Settings"
              onClick={() => setScreen("settings")}
            >
              <GearIcon />
            </Button>
          </>
        ) : (
          <span className="flex items-center gap-1">
            <Button variant="ghost" size="icon" aria-label="Back" onClick={() => setScreen("main")}>
              ←
            </Button>
            <span className="text-base font-semibold tracking-tight">Settings</span>
          </span>
        )}
      </header>
      {!input ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : screen === "settings" ? (
        <SettingsView input={input} data={data} />
      ) : (
        <MainView
          view={buildPopupView({ ...input, now: tick })}
          data={data}
          onOpenSettings={() => setScreen("settings")}
        />
      )}
    </main>
  );
}

function GearIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
