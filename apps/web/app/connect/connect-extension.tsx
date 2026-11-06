"use client";

import { useCallback, useEffect, useState } from "react";
import { sendToExtension } from "@/lib/extension/messenger";
import { type ConnectOutcome, interpretConnect, interpretStatus } from "@/lib/extension/protocol";

type View =
  | { kind: "checking" }
  | ReturnType<typeof interpretStatus>
  | { kind: "connecting" }
  | Exclude<ConnectOutcome, { kind: "connected" }>
  | { kind: "rate-limited" };

/** Connect flow (AUTH §3): PING → POST /api/extension/link → CONNECT. */
export function ConnectExtension({
  extensionId,
  userEmail,
}: {
  extensionId: string;
  /** The dashboard's signed-in email: a different account in the extension is not success. */
  userEmail: string | null;
}) {
  const [view, setView] = useState<View>({ kind: "checking" });

  const check = useCallback(async () => {
    setView({ kind: "checking" });
    setView(interpretStatus(await sendToExtension(extensionId, { type: "PING" }), userEmail));
  }, [extensionId, userEmail]);

  useEffect(() => {
    void check();
  }, [check]);

  async function connect() {
    setView({ kind: "connecting" });
    let tokenHash: string;
    try {
      const response = await fetch("/api/extension/link", { method: "POST" });
      if (response.status === 429) return setView({ kind: "rate-limited" });
      if (!response.ok) return setView({ kind: "failed" });
      const body: unknown = await response.json();
      if (typeof (body as { tokenHash?: unknown }).tokenHash !== "string") {
        return setView({ kind: "failed" });
      }
      tokenHash = (body as { tokenHash: string }).tokenHash;
    } catch {
      return setView({ kind: "failed" });
    }
    // The token lives only in this function's scope: never stored, logged or put in a URL (AUTH-09).
    const outcome = interpretConnect(
      await sendToExtension(extensionId, { type: "CONNECT", tokenHash }),
    );
    if (outcome.kind === "connected") {
      // Re-read the status so the page shows what the extension really holds now.
      return check();
    }
    setView(outcome);
  }

  return (
    <section aria-live="polite" data-testid="connect-state" data-state={view.kind}>
      <Message view={view} />
      {view.kind === "not-connected" || view.kind === "failed" || view.kind === "rate-limited" ? (
        <button type="button" onClick={connect}>
          Connect extension
        </button>
      ) : null}
      {view.kind === "not-installed" || view.kind === "outdated" ? (
        <button type="button" onClick={check}>
          Check again
        </button>
      ) : null}
    </section>
  );
}

function Message({ view }: { view: View }) {
  switch (view.kind) {
    case "checking":
      return <p>Looking for the extension…</p>;
    case "not-installed":
      return (
        <div>
          <p>The CareerOS extension isn't installed in this browser (or it's turned off).</p>
          <ol>
            <li>Download and unzip the latest extension build.</li>
            <li>
              Open <code>chrome://extensions</code> and turn on <strong>Developer mode</strong>.
            </li>
            <li>
              Click <strong>Load unpacked</strong> and choose the unzipped folder.
            </li>
            <li>Come back here and click “Check again”.</li>
          </ol>
        </div>
      );
    case "outdated":
      return <p>Please update the extension: this version can't talk to the dashboard.</p>;
    case "not-connected":
      return <p>The extension is installed but not connected to your account.</p>;
    case "connecting":
      return <p>Connecting…</p>;
    case "connected":
      return (
        <p>
          Connected as <strong data-testid="connected-email">{view.email ?? "your account"}</strong>
          . You can close this page.
        </p>
      );
    case "other-account":
    case "already-connected":
      return (
        <p role="alert">
          The extension is connected to a different account. Disconnect it from the extension popup
          first, then try again.
        </p>
      );
    case "unsynced-data":
      return (
        <p role="alert">
          The extension still holds study time from another account that hasn't been uploaded. Open
          the extension popup to resolve it, then try again.
        </p>
      );
    case "rate-limited":
      return <p role="alert">Too many attempts. Wait a minute and try again.</p>;
    case "failed":
      return <p role="alert">We couldn't connect the extension. Please try again.</p>;
  }
}
