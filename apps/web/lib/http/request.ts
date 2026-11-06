/**
 * Small helper for the dashboard's own API calls from the browser. Never throws: network errors,
 * non-2xx statuses and unexpected bodies all come back as a typed failure, and successful bodies
 * are validated with a Zod schema at the boundary (SEC-10).
 */
import type { z } from "zod";

export type RequestResult<T> =
  | { ok: true; data: T }
  /** `status` is the HTTP status, or null when the request never got a response. */
  | { ok: false; status: number | null };

export async function request<S extends z.ZodType>(
  path: string,
  options: { method?: "GET" | "POST"; schema: S },
): Promise<RequestResult<z.infer<S>>> {
  let response: Response;
  try {
    response = await fetch(path, { method: options.method ?? "GET" });
  } catch {
    return { ok: false, status: null };
  }
  if (!response.ok) return { ok: false, status: response.status };
  try {
    const parsed = options.schema.safeParse(await response.json());
    return parsed.success
      ? { ok: true, data: parsed.data }
      : { ok: false, status: response.status };
  } catch {
    return { ok: false, status: response.status };
  }
}
