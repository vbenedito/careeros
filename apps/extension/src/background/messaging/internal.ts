/**
 * Messages from the extension's own pages (the popup, EXT-UI-05a). Anything from elsewhere or
 * not matching the schema is ignored.
 */
import { PopupRequestSchema } from "../../lib/popup-messages";
import type { DomainService, DomainsResult } from "../domains/domain-service";

export interface InternalSender {
  id?: string | undefined;
  /** URL of the sending document: must be one of the extension's own pages. */
  url?: string | undefined;
}

export function createInternalMessageHandler(deps: {
  extensionId: string;
  domains: DomainService;
}) {
  return async function handle(
    message: unknown,
    sender: InternalSender,
  ): Promise<DomainsResult | null> {
    // Only the extension's own pages (popup, or popup.html opened in a tab). A content script
    // would carry the web page's URL (and v0 has none, SEC-01).
    const ownPage = sender.url?.startsWith(`chrome-extension://${deps.extensionId}/`) === true;
    if (sender.id !== deps.extensionId || !ownPage) return null;
    const parsed = PopupRequestSchema.safeParse(message);
    if (!parsed.success) return null;
    const request = parsed.data;
    switch (request.type) {
      case "DOMAINS_REFRESH":
        return deps.domains.refresh();
      case "DOMAINS_ADD":
        return deps.domains.add(request.input);
      case "DOMAINS_REMOVE":
        return deps.domains.remove(request.domain);
    }
  };
}
