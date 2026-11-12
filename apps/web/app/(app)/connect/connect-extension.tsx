"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { onMobileDevice } from "@/lib/extension/device";
import { requestLinkToken } from "@/lib/extension/link-token";
import { sendToExtension } from "@/lib/extension/messenger";
import { interpretConnect, interpretStatus } from "@/lib/extension/protocol";
import { ConnectMessage, type ConnectView } from "./connect-message";

/** Connect flow (AUTH §3): PING → POST /api/extension/link → CONNECT. */
export function ConnectExtension({
  extensionId,
  userEmail,
  installUrl,
}: {
  extensionId: string;
  /** Chrome Web Store listing (EXTENSION_INSTALL_URL, LAND-05). */
  installUrl: string;
  /** The dashboard's signed-in email: a different account in the extension is not success. */
  userEmail: string | null;
}) {
  const [view, setView] = useState<ConnectView>({ kind: "checking" });

  const check = useCallback(async () => {
    if (onMobileDevice()) return setView({ kind: "unsupported-device" });
    setView({ kind: "checking" });
    setView(interpretStatus(await sendToExtension(extensionId, { type: "PING" }), userEmail));
  }, [extensionId, userEmail]);

  useEffect(() => {
    void check();
  }, [check]);

  async function connect() {
    setView({ kind: "connecting" });
    const link = await requestLinkToken();
    if (!link.ok) return setView({ kind: link.reason });
    // The token lives only in this function's scope: never stored, logged or put in a URL (AUTH-09).
    const outcome = interpretConnect(
      await sendToExtension(extensionId, { type: "CONNECT", tokenHash: link.tokenHash }),
    );
    if (outcome.kind === "connected") {
      // Re-read the status so the page shows what the extension really holds now.
      return check();
    }
    setView(outcome);
  }

  return (
    <section
      aria-live="polite"
      data-testid="connect-state"
      data-state={view.kind}
      className="flex flex-col items-start gap-3 text-sm"
    >
      <ConnectMessage view={view} installUrl={installUrl} />
      {view.kind === "not-connected" || view.kind === "failed" || view.kind === "rate-limited" ? (
        <Button onClick={connect}>Connect extension</Button>
      ) : null}
      {view.kind === "not-installed" ||
      view.kind === "outdated" ||
      view.kind === "unknown-reply" ? (
        <Button variant="outline" onClick={check}>
          Check again
        </Button>
      ) : null}
    </section>
  );
}
