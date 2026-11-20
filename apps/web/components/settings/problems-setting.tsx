"use client";

/**
 * DASH-16: the "Track coding problems" switch ("Track LeetCode problems" before extension 0.3.1) (PRB-01, PRB-02). Turning it off with stored
 * slugs asks first (PRB-16): keep the history, delete it, or cancel.
 */
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { request } from "@/lib/http/request";
import { problemsCopy } from "@/lib/problems/copy";
import {
  EXTENSION_FOLLOWS_NOTE,
  ProblemSettingReplySchema,
  problemSettingErrorMessage,
  switchAction,
} from "@/lib/problems/settings";

export function ProblemsSetting({
  enabled,
  hasStoredProblems,
  siteTracked,
  neetCode = false,
}: {
  enabled: boolean;
  /** Only this boolean reaches the browser, never a count or a slug (DASH-16). */
  hasStoredProblems: boolean;
  /** A problem site is in the tracked sites (PRB-05). */
  siteTracked: boolean;
  /** EXTENSION_FEATURES.problemTrackingNeetCode is live (ENV-05c). */
  neetCode?: boolean;
}) {
  const copy = problemsCopy(neetCode);
  const router = useRouter();
  const labelId = useId();
  const descriptionId = useId();
  const switchRef = useRef<HTMLButtonElement>(null);
  const [shown, setShown] = useState(enabled);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setShown(enabled), [enabled]);

  async function save(next: boolean, deleteHistory?: boolean) {
    setBusy(true);
    const result = await request("/api/settings/problems", {
      method: "PUT",
      json: deleteHistory === undefined ? { enabled: next } : { enabled: next, deleteHistory },
      schema: ProblemSettingReplySchema,
    });
    setBusy(false);
    setAsking(false);
    if (!result.ok) return setError(problemSettingErrorMessage(result.error, result.status));
    setError(null);
    setShown(next);
    router.refresh();
  }

  function flip() {
    const action = switchAction(shown, hasStoredProblems);
    if (action === "ask") setAsking(true);
    else void save(action === "turn-on");
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <Switch
          ref={switchRef}
          checked={shown}
          onCheckedChange={flip}
          disabled={busy}
          aria-labelledby={labelId}
          aria-describedby={descriptionId}
        />
        <div className="flex min-w-0 flex-col gap-1">
          <span id={labelId} className="text-sm font-medium">
            {copy.settingLabel}
          </span>
          <p id={descriptionId} className="text-sm text-muted-foreground">
            {copy.settingHelp}
          </p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{EXTENSION_FOLLOWS_NOTE}</p>
      {siteTracked ? null : (
        <p className="text-sm" data-testid="problems-needs-site">
          {copy.needsSite}
        </p>
      )}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <Dialog open={asking} onOpenChange={(open) => !open && !busy && setAsking(false)}>
        <DialogContent
          onCloseAutoFocus={(event) => {
            // No trigger element: return focus to the switch, not to the page body.
            event.preventDefault();
            switchRef.current?.focus();
          }}
        >
          <DialogTitle>Also delete your problem history?</DialogTitle>
          <DialogDescription>
            Your study time stays. Only the problem names are deleted.
          </DialogDescription>
          <DialogFooter className="flex-col sm:flex-row sm:flex-wrap">
            <Button variant="outline" disabled={busy} onClick={() => void save(false, false)}>
              Turn off and keep history
            </Button>
            <Button variant="destructive" disabled={busy} onClick={() => void save(false, true)}>
              Turn off and delete history
            </Button>
            <DialogClose asChild>
              <Button variant="ghost" disabled={busy}>
                Cancel
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
