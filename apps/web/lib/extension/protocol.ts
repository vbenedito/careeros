/**
 * Interprets the extension's replies for the connect page (AUTH-07a/07b/07c). Pure: unit-tested.
 *
 * AUTH-07c (grill A3): the protocol version is read first. A reply without one is "no extension";
 * a reply of another version, or one of this version that cannot be read, comes from an
 * extension that speaks something else: "outdated", never "not installed". Reply schemas ignore
 * fields they do not know, so a newer extension may add some within protocol 1.
 */
import {
  ExtensionAckReplySchema,
  ExtensionErrorSchema,
  ExtensionStatusReplySchema,
  PROTOCOL_VERSION,
  ProtocolEnvelopeSchema,
} from "@careeros/shared";

/** Protocol versions this dashboard can talk to. */
export const DASHBOARD_PROTOCOL_VERSIONS: readonly number[] = [PROTOCOL_VERSION];

export type ExtensionState =
  | { kind: "not-installed" }
  | { kind: "outdated"; extensionVersion: string | null }
  | { kind: "not-connected"; extensionVersion: string }
  | { kind: "connected"; extensionVersion: string; email: string | null };

/** The extension version a reply states, if it states one we can show. */
function versionIn(reply: unknown): string | null {
  const value = (reply as { extensionVersion?: unknown }).extensionVersion;
  return typeof value === "string" && /^[0-9][0-9A-Za-z.+-]{0,31}$/.test(value) ? value : null;
}

/**
 * Turns a PING/STATUS reply (or no reply at all) into what the page shows. When the extension
 * is connected to a different account than the dashboard's, the page must not report success.
 */
export function interpretStatus(
  reply: unknown,
  dashboardEmail: string | null = null,
): ExtensionState | { kind: "other-account"; email: string | null } {
  const envelope = ProtocolEnvelopeSchema.safeParse(reply);
  if (!envelope.success) return { kind: "not-installed" };
  if (!DASHBOARD_PROTOCOL_VERSIONS.includes(envelope.data.protocolVersion)) {
    return { kind: "outdated", extensionVersion: versionIn(reply) };
  }
  const error = ExtensionErrorSchema.safeParse(reply);
  if (error.success) {
    return error.data.code === "UNSUPPORTED_PROTOCOL"
      ? { kind: "outdated", extensionVersion: null }
      : { kind: "not-installed" };
  }
  const status = ExtensionStatusReplySchema.safeParse(reply);
  if (!status.success) return { kind: "outdated", extensionVersion: versionIn(reply) };
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
  const envelope = ProtocolEnvelopeSchema.safeParse(reply);
  if (!envelope.success) return { kind: "failed" };
  if (!DASHBOARD_PROTOCOL_VERSIONS.includes(envelope.data.protocolVersion)) {
    return { kind: "outdated" };
  }
  const ack = ExtensionAckReplySchema.safeParse(reply);
  if (ack.success) return { kind: "connected", email: ack.data.email ?? null };
  const error = ExtensionErrorSchema.safeParse(reply);
  if (!error.success) return { kind: "outdated" };
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
