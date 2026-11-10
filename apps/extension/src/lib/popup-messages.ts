/**
 * Commands the popup sends to the service worker (EXT-UI-05a). The worker validates every
 * message with these schemas; the popup never talks to Supabase itself.
 */
import { z } from "zod";

export const PopupRequestSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("AUTH_STATUS") }).strict(),
  z.object({ type: z.literal("DOMAINS_REFRESH") }).strict(),
  z.object({ type: z.literal("DOMAINS_ADD"), input: z.string().min(1).max(2048) }).strict(),
  z.object({ type: z.literal("DOMAINS_REMOVE"), domain: z.string().min(1).max(253) }).strict(),
  z.object({ type: z.literal("TRACKING_SET"), enabled: z.boolean() }).strict(),
  z.object({ type: z.literal("DISCONNECT"), discardUnsynced: z.boolean() }).strict(),
  z.object({ type: z.literal("FORGET_LOCAL_DATA") }).strict(),
]);

export type PopupRequest = z.infer<typeof PopupRequestSchema>;

/** Reply to AUTH_STATUS (no tokens ever leave the worker). */
export interface PopupAuthStatus {
  connected: boolean;
  email: string | null;
  needsReconnect: boolean;
}

/** Reply to DISCONNECT (AUTH-12): refused while intervals are unsynced, unless discarding. */
export type PopupDisconnectResult =
  | { ok: true }
  | { ok: false; code: "UNSYNCED_DATA"; pending: number }
  | { ok: false; code: "FAILED" };

/** Reply to FORGET_LOCAL_DATA (#113): refused while an account is connected. */
export type PopupForgetResult = { ok: true } | { ok: false; code: "CONNECTED" | "FAILED" };

/** Name of the port the popup keeps open while shown (the worker treats Chrome as focused). */
export const POPUP_PORT = "careeros.popup";
