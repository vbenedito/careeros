/**
 * Messages from the extension's own pages (the popup, EXT-UI-05a). Anything from elsewhere or
 * not matching the schema is ignored.
 */
import {
  type PopupAuthStatus,
  type PopupDisconnectResult,
  type PopupForgetResult,
  type PopupNotConfigured,
  PopupRequestSchema,
  type PopupTrackingResult,
} from "../../lib/popup-messages";
import type { DomainService, DomainsResult } from "../domains/domain-service";

export interface InternalSender {
  id?: string | undefined;
  /** URL of the sending document: must be one of the extension's own pages. */
  url?: string | undefined;
}

export function createInternalMessageHandler(deps: {
  extensionId: string;
  /** Null in a build without Supabase config: site commands get NOT_CONFIGURED (#65). */
  domains: DomainService | null;
  authStatus: () => Promise<PopupAuthStatus>;
  /** EXT-UI-06: per-device switch; resolves to the stored value afterwards. */
  setTracking: (enabled: boolean) => Promise<boolean>;
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
    | PopupTrackingResult
    | PopupNotConfigured
    | null
  > {
    // Only the extension's own pages (popup, or popup.html opened in a tab). A content script
    // would carry the web page's URL (and v0 has none, SEC-01).
    const ownPage = sender.url?.startsWith(`chrome-extension://${deps.extensionId}/`) === true;
    if (sender.id !== deps.extensionId || !ownPage) return null;
    const parsed = PopupRequestSchema.safeParse(message);
    if (!parsed.success) return null;
    const request = parsed.data;
    // EXT-UI-05c (#65): a build without Supabase config answers instead of staying silent.
    const notConfigured: PopupNotConfigured = {
      ok: false,
      error: "NOT_CONFIGURED",
      code: "FAILED",
    };
    switch (request.type) {
      case "AUTH_STATUS":
        return deps.authStatus();
      case "DOMAINS_REFRESH":
        return deps.domains ? deps.domains.refresh() : notConfigured;
      case "DOMAINS_ADD":
        return deps.domains ? deps.domains.add(request.input) : notConfigured;
      case "DOMAINS_REMOVE":
        return deps.domains ? deps.domains.remove(request.domain) : notConfigured;
      case "TRACKING_SET":
        return { ok: true, enabled: await deps.setTracking(request.enabled) };
      case "DISCONNECT":
        return deps.disconnect(request.discardUnsynced);
      case "FORGET_LOCAL_DATA":
        return deps.forgetLocalData();
    }
  };
}
