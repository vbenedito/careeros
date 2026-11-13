import type { ConnectOutcome, interpretStatus } from "@/lib/extension/protocol";

/** Every state the /connect page can be in. */
export type ConnectView =
  | { kind: "checking" }
  | ReturnType<typeof interpretStatus>
  | { kind: "connecting" }
  | Exclude<ConnectOutcome, { kind: "connected" }>
  | { kind: "rate-limited" }
  /** A phone or tablet: Chrome extensions cannot be installed here. */
  | { kind: "unsupported-device" };

/** What the /connect page says in each state of the flow. */
export function ConnectMessage({ view, installUrl }: { view: ConnectView; installUrl: string }) {
  switch (view.kind) {
    case "unsupported-device":
      return (
        <p>
          The CareerOS extension runs in Chrome on a computer. Open this page there to connect it.
        </p>
      );
    case "checking":
      return <p>Looking for the extension…</p>;
    case "not-installed":
      return (
        <div>
          <p>The CareerOS extension isn't installed in this browser (or it's turned off).</p>
          <ol className="ml-5 list-decimal space-y-1">
            <li>
              Install it from the{" "}
              <a
                className="font-medium underline underline-offset-4"
                href={installUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Chrome Web Store
              </a>
              .
            </li>
            <li>Come back here and click “Check again”.</li>
          </ol>
        </div>
      );
    case "unknown-reply":
      return (
        <p role="alert" className="text-warning">
          The extension sent an answer this page doesn't understand. Reload the page and try again.
        </p>
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
        <p role="alert" className="text-warning">
          The extension is connected to a different account. Disconnect it from the extension popup
          first, then try again.
        </p>
      );
    case "unsynced-data":
      return (
        <p role="alert" className="text-warning">
          The extension still holds study time from another account that hasn't been uploaded. Open
          the extension popup to resolve it, then try again.
        </p>
      );
    case "rate-limited":
      return (
        <p role="alert" className="text-warning">
          Too many attempts. Wait a minute and try again.
        </p>
      );
    case "failed":
      return (
        <p role="alert" className="text-warning">
          We couldn't connect the extension. Please try again.
        </p>
      );
  }
}
