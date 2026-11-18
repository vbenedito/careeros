/**
 * Tracked sites in the dashboard (DASH-12): the API contract shared by the route and the browser,
 * and the messages the page shows. Pure.
 */
import { z } from "zod";

export const SiteSchema = z.object({ id: z.string().uuid(), domain: z.string() }).strict();
export type Site = z.infer<typeof SiteSchema>;

export const AddSiteRequestSchema = z.object({ domain: z.string().max(300) }).strict();

/** Error codes of POST /api/sites and DELETE /api/sites/:id. */
export type SiteErrorCode = "INVALID_DOMAIN" | "LIMIT_REACHED" | "NOT_AUTHENTICATED" | "INTERNAL";

/**
 * `limit` is the number from the server's limit error (ENT-07): never taken from a shared
 * constant at run time. Without it the message has no number.
 */
export function siteErrorMessage(
  code: string | undefined,
  status: number | null,
  limit?: number,
): string {
  if (status === null) return "Couldn't reach CareerOS. Check your connection and try again.";
  switch (code) {
    case "INVALID_DOMAIN":
      return "That doesn't look like a website address";
    case "LIMIT_REACHED":
      // ENT-09: the number comes from the error; no mention of a paid plan in v1.
      return limit === undefined
        ? "You've reached the limit of tracked sites. Remove one to add another."
        : `You can track up to ${limit} sites. Remove one to add another.`;
    case "NOT_AUTHENTICATED":
      return "Your session ended. Sign in again.";
    default:
      return "Something went wrong. Try again in a moment.";
  }
}
