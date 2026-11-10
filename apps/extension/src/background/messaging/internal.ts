/**
 * Messages from the extension's own pages (the popup, EXT-UI-05a). Anything from elsewhere or
 * not matching the schema is ignored.
 */
import {
  type PopupAuthStatus,
  type PopupDisconnectResult,
  type PopupForgetResult,
  PopupRequestSchema,
} from "../../lib/popup-messages";
import type { DomainService, DomainsResult } from "../domains/domain-service";

export interface InternalSender {
  id?: string | undefined;
  /** URL of the sending document: must be one of the extension's own pages. */
  url?: string | undefined;
}

export function createInternalMessageHandler(deps: {
  extensionId: string;
  domains: DomainService;
  authStatus: () => Promise<PopupAuthStatus>;
  /** EXT-UI-06: per-device switch. */
  setTracking: (enabled: boolean) => Promise<void>;
  /** AUTH-12 from the popup. */
  disconnect: (discardUnsynced: boolean) => Promise<PopupDisconnectResult>;
  /** AUTH-11 explicit discard while not connected (#113). */
  forgetLocalData: () => Promise<PopupForgetResult>;
}) {
  return async function handle(
    message: unknown,
    sender: InternalSender,
  ): Promise<
    | DomainsResult
    | PopupAuthStatus
    | PopupDisconnectResult
    | PopupForgetResult
    | { ok: true }
    | null
  > {
    // Only the extension's own pages (popup, or popup.html opened in a tab). A content script
    // would carry the web page's URL (and v0 has none, SEC-01).
    const ownPage = sender.url?.startsWith(`chrome-extension://${deps.extensionId}/`) === true;
    if (sender.id !== deps.extensionId || !ownPage) return null;
    const parsed = PopupRequestSchema.safeParse(message);
    if (!parsed.success) return null;
    const request = parsed.data;
    switch (request.type) {
      case "AUTH_STATUS":
        return deps.authStatus();
      case "DOMAINS_REFRESH":
        return deps.domains.refresh();
      case "DOMAINS_ADD":
        return deps.domains.add(request.input);
      case "DOMAINS_REMOVE":
        return deps.domains.remove(request.domain);
      case "TRACKING_SET":
        await deps.setTracking(request.enabled);
        return { ok: true };
      case "DISCONNECT":
        return deps.disconnect(request.discardUnsynced);
      case "FORGET_LOCAL_DATA":
        return deps.forgetLocalData();
    }
  };
}
