"use client";

/** DASH-14: email and provider, sign out, sign out of all devices (AUTH-12a), delete account. */
import { useState } from "react";
import { RedirectForm } from "@/components/app/redirect-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DELETE_CONFIRMATION } from "@/lib/settings/account";

export function AccountSettings({
  email,
  provider,
  deleteFailed = false,
}: {
  email: string;
  provider: string | null;
  deleteFailed?: boolean;
}) {
  const [typed, setTyped] = useState("");
  return (
    <div className="flex flex-col gap-6 text-sm">
      <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1">
        <dt className="text-muted-foreground">Email</dt>
        <dd className="truncate" data-testid="account-email">
          {email}
        </dd>
        {provider ? (
          <>
            <dt className="text-muted-foreground">Signed in with</dt>
            <dd>{provider}</dd>
          </>
        ) : null}
      </dl>

      <RedirectForm
        action="/auth/sign-out"
        name="scope"
        size="sm"
        className="flex flex-wrap gap-2"
        choices={[
          { value: "local", label: "Sign out", pendingLabel: "Signing out…" },
          {
            value: "global",
            label: "Sign out of all devices",
            pendingLabel: "Signing out everywhere…",
          },
        ]}
      />
      <p className="-mt-4 text-xs text-muted-foreground">
        Signing out of all devices also disconnects the extension in every browser. How your data is
        handled:{" "}
        <a href="/privacy" className="text-primary underline-offset-4 hover:underline">
          Privacy
        </a>
        .
      </p>

      <div className="flex flex-col items-start gap-2 border-t border-border pt-4">
        <h3 className="font-medium">Delete account</h3>
        <p className="text-muted-foreground">
          Permanently deletes your account, your tracked sites and all recorded study time.
        </p>
        {deleteFailed ? (
          <p role="alert" className="text-destructive">
            Your account wasn't deleted. Try again in a moment.
          </p>
        ) : null}
        <Dialog onOpenChange={() => setTyped("")}>
          <DialogTrigger asChild>
            <Button variant="destructive" size="sm">
              Delete account
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogTitle>Delete your account?</DialogTitle>
            <DialogDescription>
              This deletes all of your data and cannot be undone. Type {DELETE_CONFIRMATION} to
              confirm.
            </DialogDescription>
            <form method="post" action="/api/account/delete" className="flex flex-col gap-4">
              <Input
                name="confirm"
                aria-label={`Type ${DELETE_CONFIRMATION} to confirm`}
                autoComplete="off"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
              />
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline">
                    Cancel
                  </Button>
                </DialogClose>
                <Button
                  type="submit"
                  variant="destructive"
                  disabled={typed !== DELETE_CONFIRMATION}
                >
                  Delete account
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
