/** Browser call to POST /api/extension/link (AUTH-08). The token is returned, never stored. */
import { z } from "zod";
import { request } from "@/lib/http/request";

export const LinkTokenResponseSchema = z
  .object({ tokenHash: z.string().min(16).max(512) })
  .strict();

export type LinkTokenResult =
  | { ok: true; tokenHash: string }
  | { ok: false; reason: "rate-limited" | "failed" };

export async function requestLinkToken(): Promise<LinkTokenResult> {
  const result = await request("/api/extension/link", {
    method: "POST",
    schema: LinkTokenResponseSchema,
  });
  if (result.ok) return { ok: true, tokenHash: result.data.tokenHash };
  return { ok: false, reason: result.status === 429 ? "rate-limited" : "failed" };
}
