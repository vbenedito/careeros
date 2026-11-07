import { useState } from "react";
import type { PopupDisconnectResult } from "../../lib/popup-messages";
import { errorMessage } from "../messages";
import { Button } from "../ui";

/** EXT-UI-08 / AUTH-12: connected email and Disconnect, confirming before unsynced data is lost. */
export function AccountSetting(props: {
  email: string | null;
  onDisconnect: (discardUnsynced: boolean) => Promise<PopupDisconnectResult>;
}) {
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function disconnect(discardUnsynced: boolean) {
    setBusy(true);
    setError(null);
    const result = await props.onDisconnect(discardUnsynced);
    setBusy(false);
    if (result.ok) return setPending(null);
    if (result.code === "UNSYNCED_DATA") return setPending(result.pending);
    setError(errorMessage(result.code));
  }

  return (
    <section aria-labelledby="account-heading" className="flex flex-col gap-2">
      <h2 id="account-heading" className="text-sm font-medium">
        Account
      </h2>
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="truncate" data-testid="account-email">
          {props.email ?? "Connected"}
        </span>
        {pending === null ? (
          <Button variant="outline" disabled={busy} onClick={() => void disconnect(false)}>
            Disconnect
          </Button>
        ) : null}
      </div>
      {pending !== null ? (
        <div
          role="alertdialog"
          aria-labelledby="unsynced-title"
          className="flex flex-col gap-2 rounded-md border border-border p-3"
        >
          <p id="unsynced-title" className="text-xs">
            {pending === 1 ? "1 study session hasn't" : `${pending} study sessions haven't`} been
            uploaded yet. Disconnecting now deletes {pending === 1 ? "it" : "them"} from this
            device.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" disabled={busy} onClick={() => setPending(null)}>
              Keep connected
            </Button>
            <Button variant="destructive" disabled={busy} onClick={() => void disconnect(true)}>
              Disconnect and delete
            </Button>
          </div>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-warning">
          {error}
        </p>
      ) : null}
    </section>
  );
}
