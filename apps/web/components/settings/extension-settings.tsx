"use client";

/** DASH-13: the extension in this browser — status, Connect and Disconnect (AUTH-12). */
import { useState } from "react";
import { useExtensionStatus } from "@/components/app/extension-status";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { sendToExtension } from "@/lib/extension/messenger";
import { type DisconnectOutcome, interpretDisconnect } from "@/lib/extension/protocol";

const STATUS_TEXT = {
  "not-installed": "Not installed in this browser.",
  "not-connected": "Installed, not connected.",
  "other-account": "Connected to a different account.",
  outdated: "Installed, but it needs an update.",
} as const;

export function ExtensionSettings(props: { extensionId: string; userEmail: string | null }) {
  const [revision, setRevision] = useState(0);
  const state = useExtensionStatus(props.extensionId, props.userEmail, revision);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<DisconnectOutcome | null>(null);

  async function disconnect() {
    setBusy(true);
    const result = interpretDisconnect(
      await sendToExtension(props.extensionId, { type: "DISCONNECT" }),
    );
    setBusy(false);
    setOutcome(result);
    if (result === "disconnected") setRevision((r) => r + 1);
  }

  if (state.kind === "checking") return <Skeleton className="h-9 w-64" />;
  const connected = state.kind === "connected" || state.kind === "other-account";
  return (
    <div
      className="flex flex-col items-start gap-3 text-sm"
      data-testid="extension-settings"
      data-state={state.kind}
    >
      <p>
        {state.kind === "connected" ? (
          <>
            <span className="text-success">●</span> Connected
            {state.email ? ` as ${state.email}` : ""}.
          </>
        ) : (
          STATUS_TEXT[state.kind]
        )}
      </p>
      {outcome === "unsynced-data" ? (
        <p role="alert" className="text-warning">
          The extension has study time that isn't uploaded yet. Open the extension to sync it, or
          disconnect there to discard it.
        </p>
      ) : null}
      {outcome === "failed" ? (
        <p role="alert" className="text-destructive">
          Couldn't disconnect the extension. Try again.
        </p>
      ) : null}
      {connected ? (
        <Button variant="outline" size="sm" disabled={busy} onClick={disconnect}>
          Disconnect
        </Button>
      ) : state.kind === "not-connected" || state.kind === "not-installed" ? (
        <Button asChild size="sm">
          <a href="/connect">Connect</a>
        </Button>
      ) : null}
    </div>
  );
}
