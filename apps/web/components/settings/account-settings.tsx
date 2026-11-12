"use client";

/** DASH-14: email and provider, sign out, sign out of all devices (AUTH-12a), delete account. */
import { type FormEvent, useEffect, useRef, useState } from "react";
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
import type { AuthProvider } from "@/lib/auth/routes";
import { afterDeleteRequest, DELETE_CONFIRMATION } from "@/lib/settings/account";

const PROVIDER_NAMES: Record<AuthProvider, string> = { google: "Google", github: "GitHub" };

export function AccountSettings({
  email,
  provider,
  deleteFailed = false,
  recentSignIn = false,
  reauthProviders = ["google", "github"],
  reauthRequired = false,
}: {
  email: string;
  provider: string | null;
  deleteFailed?: boolean;
  /** AUTH-14: signed in within the last 10 minutes, so the account can be deleted now. */
  recentSignIn?: boolean;
  /** The providers offered to sign in again (the account's own one when known). */
  reauthProviders?: readonly AuthProvider[];
  /** The delete request was refused because the sign-in was no longer recent. */
  reauthRequired?: boolean;
}) {
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(false);

  // #78: submitted with fetch so that an expired session (the API's JSON 401) lands on sign-in
  // instead of a JSON page. Without JavaScript the form still posts natively.
  async function submitDelete(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setDeleting(true);
    setDeleteError(false);
    const target = await fetch(form.action, { method: "POST", body: new FormData(form) })
      .then(afterDeleteRequest)
      .catch(() => null);
    if (target) return location.assign(target);
    setDeleting(false);
    setDeleteError(true);
  }
  const deleteHeading = useRef<HTMLHeadingElement>(null);
  // Back from a refused delete: take the reader straight to the reason.
  useEffect(() => {
    if (reauthRequired) deleteHeading.current?.focus();
  }, [reauthRequired]);
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

      <div
        id="delete-account"
        className="flex scroll-mt-20 flex-col items-start gap-2 border-t border-border pt-4"
      >
        <h3 ref={deleteHeading} tabIndex={-1} className="text-sm font-medium outline-none">
          Delete account
        </h3>
        <p className="text-muted-foreground">
          Permanently deletes your account, your tracked sites and all recorded study time.
        </p>
        {deleteFailed ? (
          <p role="alert" className="text-destructive">
            Your account wasn't deleted. Try again in a moment.
          </p>
        ) : null}
        {recentSignIn ? (
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
              <form
                method="post"
                action="/api/account/delete"
                className="flex flex-col gap-4"
                onSubmit={submitDelete}
              >
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
                    disabled={typed !== DELETE_CONFIRMATION || deleting}
                  >
                    {deleting ? "Deleting…" : "Delete account"}
                  </Button>
                </DialogFooter>
                {deleteError ? (
                  <p role="alert" className="text-sm text-destructive">
                    Your account wasn't deleted. Check your connection and try again.
                  </p>
                ) : null}
              </form>
            </DialogContent>
          </Dialog>
        ) : (
          <>
            <p
              className={reauthRequired ? "text-destructive" : "text-muted-foreground"}
              role={reauthRequired ? "alert" : undefined}
            >
              {reauthRequired
                ? "Your last sign-in was more than 10 minutes ago. Sign in again to delete your account."
                : "To keep your account safe, sign in again first. You'll then have 10 minutes to delete it."}
            </p>
            <RedirectForm
              action="/auth/sign-in"
              name="provider"
              size="sm"
              className="flex flex-wrap gap-2"
              hidden={{ next: "/settings#delete-account" }}
              choices={reauthProviders.map((p) => ({
                value: p,
                label: `Sign in again with ${PROVIDER_NAMES[p]}`,
                pendingLabel: `Redirecting to ${PROVIDER_NAMES[p]}…`,
              }))}
            />
          </>
        )}
      </div>
    </div>
  );
}
