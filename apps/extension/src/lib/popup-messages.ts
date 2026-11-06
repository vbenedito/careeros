/**
 * Commands the popup sends to the service worker (EXT-UI-05a). The worker validates every
 * message with these schemas; the popup never talks to Supabase itself.
 */
import { z } from "zod";

export const PopupRequestSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("DOMAINS_REFRESH") }).strict(),
  z.object({ type: z.literal("DOMAINS_ADD"), input: z.string().min(1).max(2048) }).strict(),
  z.object({ type: z.literal("DOMAINS_REMOVE"), domain: z.string().min(1).max(253) }).strict(),
]);

export type PopupRequest = z.infer<typeof PopupRequestSchema>;
