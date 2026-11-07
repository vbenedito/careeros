import { type ReactNode, useState } from "react";
import type { PopupStatus } from "../../lib/popup-view";
import type { PopupData } from "../data";
import { errorMessage } from "../messages";
import { Button, cn } from "../ui";

type Tone = "success" | "muted" | "warning";
const TONES: Record<Tone, string> = {
  success: "text-success",
  muted: "text-muted-foreground",
  warning: "text-warning",
};

/** Status line with one optional action (spec 05 §2 "Status states"). */
export function StatusSection({
  status,
  data,
  onOpenSettings,
}: {
  status: PopupStatus;
  data: PopupData;
  onOpenSettings: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(host: string) {
    setAdding(true);
    setError(null);
    const result = await data.addSite(host);
    setAdding(false);
    if (!result.ok) setError(errorMessage(result.error));
  }
  const addButton = (host: string | null, label: string) =>
    host ? (
      <Button disabled={adding} onClick={() => void add(host)}>
        {label}
      </Button>
    ) : null;

  const settingsLink = (label: string) => (
    <Button variant="link" className="text-xs" onClick={onOpenSettings}>
      {label}
    </Button>
  );
  const { label, tone, hint } = describe(status, addButton, settingsLink, data);
  return (
    <section aria-label="Status" aria-live="polite" className="flex flex-col gap-1.5">
      <p
        className="flex items-center gap-2 text-sm font-medium"
        data-testid="status"
        data-state={status.kind}
      >
        <span aria-hidden="true" className={cn(TONES[tone])}>
          {tone === "success" ? "●" : tone === "warning" ? "!" : "○"}
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

function describe(
  status: PopupStatus,
  addButton: (host: string | null, label: string) => ReactNode,
  settingsLink: (label: string) => ReactNode,
  data: PopupData,
): { label: string; tone: Tone; hint: ReactNode } {
  switch (status.kind) {
    case "tracking":
      return { label: "Tracking", tone: "success", hint: null };
    case "idle":
      return { label: "Paused — inactive", tone: "muted", hint: "Resumes when you're back" };
    case "untracked":
      return {
        label: "Not tracking this site",
        tone: "muted",
        hint: addButton(status.addHost, `Add ${status.addHost ?? ""}`),
      };
    case "no-sites":
      return {
        label: "No study sites yet",
        tone: "muted",
        hint: addButton(status.addHost, "Add this site") ?? settingsLink("Manage sites"),
      };
    case "loading-sites":
      return { label: "Loading your sites…", tone: "muted", hint: null };
    case "disabled":
      return { label: "Tracking off", tone: "muted", hint: settingsLink("Turn on in Settings") };
    case "disconnected":
      return {
        label: "Not connected",
        tone: "warning",
        hint: <Button onClick={() => data.openDashboard("/connect")}>Connect account</Button>,
      };
  }
}
