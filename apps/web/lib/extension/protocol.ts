/**
 * Interprets the extension's replies for the connect page (AUTH-07a/07b). Pure: unit-tested.
 */
import {
  ExtensionAckReplySchema,
  ExtensionErrorSchema,
  ExtensionStatusReplySchema,
  PROTOCOL_VERSION,
} from "@careeros/shared";

/** Protocol versions this dashboard can talk to. */
export const DASHBOARD_PROTOCOL_VERSIONS: readonly number[] = [PROTOCOL_VERSION];

export type ExtensionState =
  | { kind: "not-installed" }
  | { kind: "outdated"; extensionVersion: string | null }
  | { kind: "not-connected"; extensionVersion: string }
  | { kind: "connected"; extensionVersion: string; email: string | null };

/**
 * Turns a PING/STATUS reply (or no reply at all) into what the page shows. When the extension
 * is connected to a different account than the dashboard's, the page must not report success.
 */
export function interpretStatus(
  reply: unknown,
  dashboardEmail: string | null = null,
): ExtensionState | { kind: "other-account"; email: string | null } {
  if (reply === undefined || reply === null) return { kind: "not-installed" };
  const error = ExtensionErrorSchema.safeParse(reply);
  if (error.success) {
    return error.data.code === "UNSUPPORTED_PROTOCOL"
      ? { kind: "outdated", extensionVersion: null }
      : { kind: "not-installed" };
  }
  const status = ExtensionStatusReplySchema.safeParse(reply);
  if (!status.success) return { kind: "not-installed" };
  if (!DASHBOARD_PROTOCOL_VERSIONS.includes(status.data.protocolVersion)) {
    return { kind: "outdated", extensionVersion: status.data.extensionVersion };
  }
  if (!status.data.connected) {
    return { kind: "not-connected", extensionVersion: status.data.extensionVersion };
  }
  const email = status.data.email ?? null;
  if (dashboardEmail && email?.toLowerCase() !== dashboardEmail.toLowerCase()) {
    return { kind: "other-account", email };
  }
  return { kind: "connected", extensionVersion: status.data.extensionVersion, email };
}

export type ConnectOutcome =
  | { kind: "connected"; email: string | null }
  | { kind: "already-connected" }
  | { kind: "unsynced-data" }
  | { kind: "outdated" }
  | { kind: "failed" };

/** Turns a CONNECT reply into what the page shows. */
export function interpretConnect(reply: unknown): ConnectOutcome {
  const ack = ExtensionAckReplySchema.safeParse(reply);
  if (ack.success) return { kind: "connected", email: ack.data.email ?? null };
  const error = ExtensionErrorSchema.safeParse(reply);
  if (!error.success) return { kind: "failed" };
  switch (error.data.code) {
    case "ALREADY_CONNECTED":
      return { kind: "already-connected" };
    case "UNSYNCED_DATA":
      return { kind: "unsynced-data" };
    case "UNSUPPORTED_PROTOCOL":
      return { kind: "outdated" };
    default:
      return { kind: "failed" };
  }
}

export type DisconnectOutcome = "disconnected" | "unsynced-data" | "failed";

/**
 * Turns a DISCONNECT reply into what Settings shows (AUTH-12). From the dashboard, unsynced
 * study time is never discarded: the extension refuses and the user resolves it in the popup.
 */
export function interpretDisconnect(reply: unknown): DisconnectOutcome {
  if (ExtensionAckReplySchema.safeParse(reply).success) return "disconnected";
  const error = ExtensionErrorSchema.safeParse(reply);
  return error.success && error.data.code === "UNSYNCED_DATA" ? "unsynced-data" : "failed";
}
