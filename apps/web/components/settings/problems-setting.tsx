"use client";

/**
 * DASH-16: the "Track LeetCode problems" switch (PRB-01, PRB-02). Turning it off with stored
 * slugs asks first (PRB-16): keep the history, delete it, or cancel.
 */
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
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
import {
  EXTENSION_FOLLOWS_NOTE,
  ProblemSettingReplySchema,
  problemSettingErrorMessage,
  switchAction,
} from "@/lib/problems/settings";

export function ProblemsSetting({
  enabled,
  hasStoredProblems,
  leetcodeTracked,
}: {
  enabled: boolean;
  /** Only this boolean reaches the browser, never a count or a slug (DASH-16). */
  hasStoredProblems: boolean;
  leetcodeTracked: boolean;
}) {
  const router = useRouter();
  const labelId = useId();
  const descriptionId = useId();
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
          checked={shown}
          onCheckedChange={flip}
          disabled={busy}
          aria-labelledby={labelId}
          aria-describedby={descriptionId}
        />
        <div className="flex min-w-0 flex-col gap-1">
          <span id={labelId} className="text-sm font-medium">
            Track LeetCode problems
          </span>
          <p id={descriptionId} className="text-sm text-muted-foreground">
            Saves the problem name from LeetCode addresses (like two-sum) with your study time.
            Nothing else from the address.
          </p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{EXTENSION_FOLLOWS_NOTE}</p>
      {leetcodeTracked ? null : (
        <p className="text-sm" data-testid="problems-needs-leetcode">
          This needs leetcode.com in your tracked sites. Add it above.
        </p>
      )}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <Dialog open={asking} onOpenChange={(open) => !open && !busy && setAsking(false)}>
        <DialogContent>
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
