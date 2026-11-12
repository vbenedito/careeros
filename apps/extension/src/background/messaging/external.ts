/**
 * Messages from the dashboard page (AUTH-06/07/07a/07b, SEC-05).
 * Chrome only delivers external messages from origins listed in externally_connectable; this
 * handler checks again, validates every payload, and ignores anything unexpected.
 */
import {
  type ExtensionAckReply,
  type ExtensionError,
  ExtensionRequestSchema,
  type ExtensionStatusReply,
  PROTOCOL_VERSION,
  ProtocolEnvelopeSchema,
} from "@careeros/shared";
import { errorKind } from "../../lib/error-kind";
import type { Logger } from "../../lib/log";
import type { AuthService } from "../auth/auth-service";

/** Protocol versions this build understands (AUTH-07a). */
export const SUPPORTED_PROTOCOL_VERSIONS: readonly number[] = [1];

export interface ExternalSender {
  /** Set by Chrome for messages from web pages. */
  origin?: string | undefined;
  /** Set by Chrome when the sender is another extension. */
  id?: string | undefined;
}

export type ExternalReply = ExtensionStatusReply | ExtensionAckReply | ExtensionError;

export function createExternalMessageHandler(deps: {
  auth: AuthService;
  dashboardOrigin: string;
  extensionVersion: string;
  log?: Logger;
}) {
  const { auth, dashboardOrigin, extensionVersion } = deps;
  const error = (code: ExtensionError["code"]): ExtensionError => ({
    ok: false,
    code,
    protocolVersion: PROTOCOL_VERSION,
  });

  /** Returns the reply, or null when the message must be ignored (no reply at all). */
  return async function handle(
    message: unknown,
    sender: ExternalSender,
  ): Promise<ExternalReply | null> {
    // Only the dashboard page; never another extension (sender.id) or another origin.
    if (sender.id !== undefined || sender.origin !== dashboardOrigin) return null;

    // AUTH-07c (grill A3): the version first. A message of another version (a newer dashboard,
    // possibly with new types or fields) gets UNSUPPORTED_PROTOCOL instead of silence, so the
    // dashboard can say "update" rather than "not installed".
    const envelope = ProtocolEnvelopeSchema.safeParse(message);
    if (!envelope.success) return null;
    if (!SUPPORTED_PROTOCOL_VERSIONS.includes(envelope.data.protocolVersion)) {
      return error("UNSUPPORTED_PROTOCOL");
    }
    // A message of a supported version must match it exactly (AUTH-07).
    const parsed = ExtensionRequestSchema.safeParse(message);
    if (!parsed.success) return null;
    const request = parsed.data;

    try {
      switch (request.type) {
        case "PING":
        case "STATUS": {
          const status = await auth.status();
          return {
            ok: true,
            protocolVersion: PROTOCOL_VERSION,
            extensionVersion,
            connected: status.connected,
            ...(status.email ? { email: status.email } : {}),
          };
        }
        case "CONNECT": {
          const result = await auth.connect(request.tokenHash);
          if (!result.ok) return error(result.code);
          return {
            ok: true,
            protocolVersion: PROTOCOL_VERSION,
            ...(result.email ? { email: result.email } : {}),
          };
        }
        case "DISCONNECT": {
          // From the dashboard, unsynced data is never discarded silently (AUTH-12).
          const result = await auth.disconnect();
          if (result.ok) return { ok: true, protocolVersion: PROTOCOL_VERSION };
          // Protocol 1 has no "still syncing" code: the dashboard shows its unsynced-data
          // message, and trying again works once the upload is done (AUTH-12b).
          return error(result.code === "SYNC_IN_PROGRESS" ? "UNSYNCED_DATA" : result.code);
        }
      }
    } catch (cause) {
      // SYNC-06b (grill H5): the kind only (class name, known code), never the message.
      deps.log?.warn("external.request_failed", { type: request.type, kind: errorKind(cause) });
      return error("INTERNAL");
    }
  };
}
