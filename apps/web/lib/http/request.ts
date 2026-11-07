/**
 * Small helper for the dashboard's own API calls from the browser. Never throws: network errors,
 * non-2xx statuses and unexpected bodies all come back as a typed failure, and successful bodies
 * are validated with a Zod schema at the boundary (SEC-10).
 */
import type { z } from "zod";

export type RequestResult<T> =
  | { ok: true; data: T }
  /**
   * `status` is the HTTP status, or null when the request never got a response; `error` is the
   * route's `{ error }` code when it sent one.
   */
  | { ok: false; status: number | null; error?: string };

export async function request<S extends z.ZodType>(
  path: string,
  options: { method?: "GET" | "POST" | "DELETE"; json?: unknown; schema: S },
): Promise<RequestResult<z.infer<S>>> {
  const init: RequestInit = { method: options.method ?? "GET" };
  if (options.json !== undefined) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(options.json);
  }
  let response: Response;
  try {
    response = await fetch(path, init);
  } catch {
    return { ok: false, status: null };
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, status: response.status };
  }
  if (!response.ok) {
    const error = (body as { error?: unknown } | null)?.error;
    return typeof error === "string"
      ? { ok: false, status: response.status, error }
      : { ok: false, status: response.status };
  }
  const parsed = options.schema.safeParse(body);
  return parsed.success ? { ok: true, data: parsed.data } : { ok: false, status: response.status };
}
