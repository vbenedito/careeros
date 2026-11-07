"use client";

/**
 * Asks the extension in *this* browser whether it is connected (DASH-11, DASH-13). There is no
 * server-side device registry in v0, so only the browser can answer.
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { sendToExtension } from "@/lib/extension/messenger";
import { interpretStatus } from "@/lib/extension/protocol";

type State = { kind: "checking" } | ReturnType<typeof interpretStatus>;

/** `revision` re-asks the extension when it changes (e.g. after a disconnect). */
export function useExtensionStatus(
  extensionId: string,
  userEmail: string | null,
  revision = 0,
): State {
  const [state, setState] = useState<State>({ kind: "checking" });
  useEffect(() => {
    void revision;
    let cancelled = false;
    void sendToExtension(extensionId, { type: "PING" }).then((reply) => {
      if (!cancelled) setState(interpretStatus(reply, userEmail));
    });
    return () => {
      cancelled = true;
    };
  }, [extensionId, userEmail, revision]);
  return state;
}

const MESSAGES: Record<Exclude<State["kind"], "checking" | "connected">, string> = {
  "not-installed": "Install the CareerOS extension in this browser to start tracking.",
  "not-connected": "The extension is installed but not connected to your account.",
  "other-account": "The extension in this browser is connected to a different account.",
  outdated: "Please update the extension.",
};

/** One line about the extension in this browser, with a Connect action only when needed. */
export function ExtensionStatus(props: { extensionId: string; userEmail: string | null }) {
  const state = useExtensionStatus(props.extensionId, props.userEmail);
  if (state.kind === "checking") return <Skeleton className="h-5 w-64" />;
  if (state.kind === "connected") {
    return (
      <p
        className="text-sm text-muted-foreground"
        data-testid="extension-status"
        data-state="connected"
      >
        <span className="text-success">●</span> Extension connected in this browser
        {state.email ? ` as ${state.email}` : ""}.
      </p>
    );
  }
  return (
    <div
      className="flex flex-col items-start gap-3 text-sm"
      data-testid="extension-status"
      data-state={state.kind}
    >
      <p>{MESSAGES[state.kind]}</p>
      <Button asChild size="sm">
        <a href="/connect">Connect the extension</a>
      </Button>
    </div>
  );
}
