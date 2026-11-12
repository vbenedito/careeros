import { useEffect, useRef, useState } from "react";
import type { PopupDisconnectResult } from "../../lib/popup-messages";
import { errorMessage } from "../messages";
import { Button } from "../ui";

/**
 * EXT-UI-08 / AUTH-12, AUTH-12b (#65): connected email and Disconnect. When sessions are not on
 * the server (unsynced or rejected), the confirmation says how many and offers "Try syncing
 * again" (Disconnect again without discarding: the final sync runs again) before "Disconnect
 * anyway".
 */
export function AccountSetting(props: {
  email: string | null;
  onDisconnect: (discardUnsynced: boolean) => Promise<PopupDisconnectResult>;
}) {
  const [busy, setBusy] = useState<"disconnect" | "retry" | "discard" | null>(null);
  const [pending, setPending] = useState<number | null>(null);
  const [retried, setRetried] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const retryRef = useRef<HTMLButtonElement>(null);
  const disconnectRef = useRef<HTMLButtonElement>(null);
  const wasConfirming = useRef(false);

  // EXT-UI-09: the confirmation takes focus (so it is announced); closing it returns focus.
  useEffect(() => {
    if (pending !== null && !wasConfirming.current) retryRef.current?.focus();
    else if (pending === null && wasConfirming.current) disconnectRef.current?.focus();
    wasConfirming.current = pending !== null;
  }, [pending]);

  async function disconnect(kind: "disconnect" | "retry" | "discard") {
    setBusy(kind);
    setError(null);
    const result = await props.onDisconnect(kind === "discard");
    setBusy(null);
    if (result.ok) return setPending(null);
    if (result.code === "UNSYNCED_DATA") {
      setRetried(kind === "retry");
      return setPending(result.pending);
    }
    setError(errorMessage(result.code));
  }

  const close = () => {
    if (busy) return;
    setPending(null);
    setRetried(false);
    setError(null);
  };
  const sessions = (n: number) =>
    n === 1 ? "1 study session hasn't" : `${n} study sessions haven't`;

  return (
    <section aria-labelledby="account-heading" className="flex flex-col gap-2">
      <h2 id="account-heading" className="text-sm font-medium">
        Account
      </h2>
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="min-w-0 truncate" data-testid="account-email">
          {props.email ?? "Connected"}
        </span>
        {pending === null ? (
          <Button
            ref={disconnectRef}
            variant="outline"
            className="shrink-0"
            aria-disabled={busy !== null}
            onClick={() => {
              if (!busy) void disconnect("disconnect");
            }}
          >
            {busy === "disconnect" ? "Disconnecting…" : "Disconnect"}
          </Button>
        ) : null}
      </div>
      {pending !== null ? (
        <div
          role="alertdialog"
          aria-labelledby="unsynced-heading"
          aria-describedby="unsynced-text"
          onKeyDown={(e) => {
            if (e.key === "Escape") close();
          }}
          className="flex flex-col gap-2 rounded-md border border-border p-3"
        >
          <p id="unsynced-heading" className="text-sm font-medium">
            Delete unsynced sessions?
          </p>
          <p id="unsynced-text" className="text-xs">
            {sessions(pending)} synced yet and will be deleted.
          </p>
          <p role="status" className="text-xs text-muted-foreground empty:sr-only">
            {retried && busy === null ? "Still not synced." : ""}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button
              ref={retryRef}
              variant="outline"
              aria-disabled={busy !== null}
              onClick={() => {
                if (!busy) void disconnect("retry");
              }}
            >
              {busy === "retry" ? "Syncing…" : "Try syncing again"}
            </Button>
            <Button
              variant="destructive"
              aria-disabled={busy !== null}
              onClick={() => {
                if (!busy) void disconnect("discard");
              }}
            >
              Disconnect anyway
            </Button>
            <Button
              variant="ghost"
              className="col-span-2"
              aria-disabled={busy !== null}
              onClick={close}
            >
              Cancel
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
