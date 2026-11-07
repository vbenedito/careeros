import { formatDuration } from "@careeros/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { buildPopupView, type PopupInput, type PopupStatus } from "../lib/popup-view";
import type { PopupData } from "./data";

/** Popup main view (spec 05 §2). Renders `buildPopupView`; all rules live there. */
export function App({ data, now = () => Date.now() }: { data: PopupData; now?: () => number }) {
  const [input, setInput] = useState<Omit<PopupInput, "now"> | null>(null);
  const [tick, setTick] = useState(now());
  const clock = useRef(now);
  clock.current = now;

  const reload = useCallback(() => {
    void data.load().then(setInput);
  }, [data]);

  useEffect(() => {
    reload();
    void data.refreshSites(); // SYNC-09: refresh on popup open
    const unsubscribe = data.subscribe(reload);
    // EXT-UI-02: live values update every second while the popup is open.
    const timer = setInterval(() => setTick(clock.current()), 1000);
    return () => {
      unsubscribe();
      clearInterval(timer);
    };
  }, [data, reload]);

  if (!input) return <main className="p-4 text-sm text-muted-foreground">Loading…</main>;
  const view = buildPopupView({ ...input, now: tick });

  return (
    <main className="flex flex-col gap-3 p-4">
      <header className="flex items-center justify-between">
        <span className="text-base font-semibold tracking-tight">CareerOS</span>
      </header>

      <Status status={view.status} data={data} />

      <section aria-label="Today" className="rounded-lg border border-border bg-card px-4 py-3">
        <p className="text-4xl font-semibold tabular-nums" data-testid="today-total">
          {formatDuration(view.todaySeconds)}
        </p>
        <p className="text-xs text-muted-foreground">Today on this device</p>
      </section>

      {view.current ? (
        <p className="text-sm" data-testid="current-session">
          <span className="font-medium">{view.current.domain}</span>
          <span className="text-muted-foreground"> · {formatDuration(view.current.seconds)}</span>
        </p>
      ) : null}

      {view.top.length > 0 ? (
        <section aria-label="Top sites today">
          <ul className="flex flex-col gap-2">
            {view.top.map((d) => (
              <li key={d.domain} className="flex flex-col gap-1">
                <div className="flex justify-between text-sm">
                  <span>{d.domain}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {formatDuration(d.seconds)}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-border" aria-hidden="true">
                  <div
                    className="h-1.5 rounded-full bg-bar"
                    style={{ width: `${Math.round(d.share * 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <footer className="flex items-center justify-between border-t border-border pt-2 text-xs text-muted-foreground">
        <span
          data-testid="sync-label"
          title={
            view.quarantined > 0
              ? "These intervals were rejected by the server and are kept on this device."
              : undefined
          }
        >
          {view.syncLabel}
          {view.quarantined > 0 ? ` · ${view.quarantined} not synced` : ""}
        </span>
        <span className="flex items-center gap-2">
          <span>v{data.version}</span>
          <button
            type="button"
            className="text-primary hover:underline"
            onClick={() => data.openDashboard()}
          >
            Open dashboard ↗
          </button>
        </span>
      </footer>
    </main>
  );
}

const DOT = { on: "●", off: "○", alert: "!" } as const;

function Status({ status, data }: { status: PopupStatus; data: PopupData }) {
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(host: string) {
    setAdding(true);
    setError(null);
    const result = await data.addSite(host);
    setAdding(false);
    if (!result.ok) setError(ERRORS[result.error] ?? ERRORS.UNAVAILABLE ?? null);
  }

  const addButton = (host: string | null, label: string) =>
    host ? (
      <button
        type="button"
        disabled={adding}
        onClick={() => void add(host)}
        className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground disabled:opacity-60"
      >
        {label}
      </button>
    ) : null;

  let label: string;
  let dot: string;
  let tone: string;
  let hint: React.ReactNode = null;
  switch (status.kind) {
    case "tracking":
      [label, dot, tone] = ["Tracking", DOT.on, "text-success"];
      break;
    case "idle":
      [label, dot, tone] = ["Paused — inactive", DOT.off, "text-muted-foreground"];
      hint = <span>Resumes when you're back</span>;
      break;
    case "untracked":
      [label, dot, tone] = ["Not tracking this site", DOT.off, "text-muted-foreground"];
      hint = addButton(status.addHost, `Add ${status.addHost ?? ""}`);
      break;
    case "no-sites":
      [label, dot, tone] = ["No study sites yet", DOT.off, "text-muted-foreground"];
      hint = addButton(status.addHost, "Add this site");
      break;
    case "loading-sites":
      [label, dot, tone] = ["Loading your sites…", DOT.off, "text-muted-foreground"];
      break;
    case "disabled":
      [label, dot, tone] = ["Tracking off", DOT.off, "text-muted-foreground"];
      hint = <span>Turn on in Settings</span>;
      break;
    case "disconnected":
      [label, dot, tone] = ["Not connected", DOT.alert, "text-warning"];
      hint = (
        <button
          type="button"
          onClick={() => data.openDashboard("/connect")}
          className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground"
        >
          Connect account
        </button>
      );
      break;
  }

  return (
    <section aria-label="Status" aria-live="polite" className="flex flex-col gap-1.5">
      <p
        className="flex items-center gap-2 text-sm font-medium"
        data-testid="status"
        data-state={status.kind}
      >
        <span aria-hidden="true" className={tone}>
          {dot}
        </span>
        {label}
      </p>
      {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
      {error ? (
        <p role="alert" className="text-xs text-warning">
          {error}
        </p>
      ) : null}
    </section>
  );
}

const ERRORS: Record<string, string> = {
  INVALID_DOMAIN: "That doesn't look like a website address.",
  LIMIT_REACHED: "You can track up to 50 sites.",
  NOT_CONNECTED: "Connect your account first.",
  UNAVAILABLE: "Couldn't reach CareerOS. Try again in a moment.",
};
