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

/** Turns a PING/STATUS reply (or no reply at all) into what the page shows. */
export function interpretStatus(reply: unknown): ExtensionState {
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
  return status.data.connected
    ? {
        kind: "connected",
        extensionVersion: status.data.extensionVersion,
        email: status.data.email ?? null,
      }
    : { kind: "not-connected", extensionVersion: status.data.extensionVersion };
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
