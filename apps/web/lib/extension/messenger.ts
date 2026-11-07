/**
 * Browser-side messaging to the CareerOS extension (AUTH-06/07). Only works on the dashboard
 * origin, which the extension lists in externally_connectable.
 */
import { type ExtensionRequest, PROTOCOL_VERSION } from "@careeros/shared";

type SendMessage = (id: string, message: unknown, callback: (reply: unknown) => void) => void;
interface ChromeRuntime {
  sendMessage?: SendMessage;
  lastError?: { message?: string };
}

const TIMEOUT_MS = 2000;
/**
 * DISCONNECT replies only after a final sync and a bounded session revoke (AUTH-12; the revoke
 * alone may wait 5 s), so it gets a longer wait than the quick status messages.
 */
const SLOW_TIMEOUT_MS = 15_000;

/** A request without its protocolVersion (added here). Distributes over the union. */
export type OutgoingMessage = ExtensionRequest extends infer R
  ? R extends ExtensionRequest
    ? Omit<R, "protocolVersion">
    : never
  : never;

function runtime(): ChromeRuntime | undefined {
  return (globalThis as { chrome?: { runtime?: ChromeRuntime } }).chrome?.runtime;
}

/**
 * Sends a message and resolves with the reply, or undefined when the extension is not installed,
 * disabled or does not answer in time.
 */
export function sendToExtension(extensionId: string, message: OutgoingMessage): Promise<unknown> {
  const rt = runtime();
  if (!rt?.sendMessage || !extensionId) return Promise.resolve(undefined);
  const send = rt.sendMessage;
  return new Promise((resolve) => {
    const timeout = message.type === "DISCONNECT" ? SLOW_TIMEOUT_MS : TIMEOUT_MS;
    const timer = setTimeout(() => resolve(undefined), timeout);
    try {
      send(extensionId, { ...message, protocolVersion: PROTOCOL_VERSION }, (reply) => {
        clearTimeout(timer);
        // Reading lastError marks it as handled ("Could not establish connection" = not installed).
        resolve(rt.lastError ? undefined : reply);
      });
    } catch {
      clearTimeout(timer);
      resolve(undefined);
    }
  });
}
