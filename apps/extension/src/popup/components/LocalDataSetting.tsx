import { useEffect, useRef, useState } from "react";
import type { PopupForgetResult } from "../../lib/popup-messages";
import { errorMessage } from "../messages";
import { Button } from "../ui";

/**
 * AUTH-11 explicit discard (#113), shown only while no account is connected and data from the
 * last account is still on this computer (e.g. the account was deleted, signed out everywhere,
 * or someone else used this Chrome profile). Deleting needs a confirmation (EXT-UI-09 focus).
 */
export function LocalDataSetting(props: {
  pending: number;
  onForget: () => Promise<PopupForgetResult>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const openRef = useRef<HTMLButtonElement>(null);
  const wasConfirming = useRef(false);

  useEffect(() => {
    if (confirming) cancelRef.current?.focus();
    else if (wasConfirming.current) openRef.current?.focus();
    wasConfirming.current = confirming;
  }, [confirming]);

  async function forget() {
    setBusy(true);
    setError(null);
    const result = await props.onForget();
    setBusy(false);
    if (result.ok) return setConfirming(false);
    setError(errorMessage(result.code));
  }

  return (
    <section aria-labelledby="local-data-heading" className="flex flex-col items-start gap-2">
      <h2 id="local-data-heading" className="text-sm font-medium">
        Data on this computer
      </h2>
      <p className="text-xs text-muted-foreground">
        Study time and sites from the last connected account are still stored here
        {props.pending > 0
          ? `, including ${props.pending === 1 ? "1 session" : `${props.pending} sessions`} not uploaded yet`
          : ""}
        . Connecting the same account again uploads them.
      </p>
      {confirming ? (
        <div
          role="alertdialog"
          aria-labelledby="forget-heading"
          aria-describedby="forget-text"
          onKeyDown={(e) => {
            if (e.key === "Escape") setConfirming(false);
          }}
          className="flex w-full flex-col gap-2 rounded-md border border-border p-3"
        >
          <p id="forget-heading" className="text-sm font-medium">
            Forget local data?
          </p>
          <p id="forget-text" className="text-xs">
            Deletes everything the last account left on this computer. Sessions that were not
            uploaded are lost.
          </p>
          <div className="flex justify-end gap-2">
            <Button
              ref={cancelRef}
              variant="ghost"
              disabled={busy}
              onClick={() => setConfirming(false)}
            >
              Keep
            </Button>
            <Button variant="destructive" disabled={busy} onClick={() => void forget()}>
              Forget local data
            </Button>
          </div>
        </div>
      ) : (
        <Button ref={openRef} variant="destructive-ghost" onClick={() => setConfirming(true)}>
          Forget local data
        </Button>
      )}
      {error ? (
        <p role="alert" className="text-xs text-warning">
          {error}
        </p>
      ) : null}
    </section>
  );
}
