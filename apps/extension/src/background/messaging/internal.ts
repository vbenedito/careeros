/**
 * Messages from the extension's own pages (the popup, EXT-UI-05a). Anything from elsewhere or
 * not matching the schema is ignored.
 */
import { PopupRequestSchema } from "../../lib/popup-messages";
import type { DomainService, DomainsResult } from "../domains/domain-service";

export interface InternalSender {
  id?: string | undefined;
  /** Set when the sender is a tab (content script or web page): never accepted. */
  tab?: unknown;
}

export function createInternalMessageHandler(deps: {
  extensionId: string;
  domains: DomainService;
}) {
  return async function handle(
    message: unknown,
    sender: InternalSender,
  ): Promise<DomainsResult | null> {
    if (sender.id !== deps.extensionId || sender.tab !== undefined) return null;
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
