/**
 * Validation schemas shared by the extension and the dashboard (SEC-10).
 * The database re-validates everything (DATA-07); these schemas are the first boundary.
 */
import { z } from "zod";
import { DATA, TRACKING } from "./constants";
import { isValidDomain } from "./domain";

export const DomainSchema = z
  .string()
  .refine(isValidDomain, { message: "Invalid or non-normalized domain" });

/** UTC ISO-8601 with whole seconds, e.g. `2026-11-05T09:30:00Z` (TRK-10). */
export const UtcSecondsSchema = z.iso.datetime({ precision: 0 });

const MAX_ACCEPTED_S = TRACKING.MAX_INTERVAL_S + DATA.INTERVAL_TOLERANCE_S;

/**
 * TRK-10 closed interval, as stored in the outbox and sent to `ingest_study_sessions`.
 * MIN_INTERVAL_S is not enforced here: the engine discards short intervals before they are
 * stored (TRK-10), and the server only requires a positive duration (DATA-02).
 */
export const IntervalSchema = z
  .object({
    id: z.uuid({ version: "v4" }),
    device_id: z.uuid(),
    domain: DomainSchema,
    started_at: UtcSecondsSchema,
    ended_at: UtcSecondsSchema,
  })
  .strict()
  .superRefine((interval, ctx) => {
    const seconds = (Date.parse(interval.ended_at) - Date.parse(interval.started_at)) / 1000;
    if (seconds <= 0) {
      ctx.addIssue({ code: "custom", message: "ended_at must be after started_at" });
    } else if (seconds > MAX_ACCEPTED_S) {
      ctx.addIssue({ code: "custom", message: `Interval longer than ${MAX_ACCEPTED_S}s` });
    }
  });

export type Interval = z.infer<typeof IntervalSchema>;

// ---------------------------------------------------------------------------------------------
// Dashboard → extension messages (AUTH-07, AUTH-07a, AUTH-07b)
// ---------------------------------------------------------------------------------------------

const ProtocolVersionSchema = z.number().int().min(1);

/**
 * AUTH-07c (grill A3): read first, before the rest of a message or reply. Only the version is
 * checked; whatever else the object holds is left for the schema of that version. A message the
 * receiver cannot read further can then still be told apart as "another protocol version".
 */
export const ProtocolEnvelopeSchema = z.object({ protocolVersion: ProtocolVersionSchema });

/**
 * Messages the extension accepts from the dashboard origin. Anything else is ignored. Requests of
 * a supported version stay strict (AUTH-07): a v1 dashboard never sends more than this.
 */
export const ExtensionRequestSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("PING"), protocolVersion: ProtocolVersionSchema }).strict(),
  z.object({ type: z.literal("STATUS"), protocolVersion: ProtocolVersionSchema }).strict(),
  z
    .object({
      type: z.literal("CONNECT"),
      protocolVersion: ProtocolVersionSchema,
      /** Single-use hashed token from /api/extension/link (AUTH-09). Never logged. */
      tokenHash: z.string().min(16).max(512),
    })
    .strict(),
  z.object({ type: z.literal("DISCONNECT"), protocolVersion: ProtocolVersionSchema }).strict(),
]);

export type ExtensionRequest = z.infer<typeof ExtensionRequestSchema>;

export const EXTENSION_ERROR_CODES = [
  "ALREADY_CONNECTED",
  "UNSUPPORTED_PROTOCOL",
  "INVALID_TOKEN",
  "UNSYNCED_DATA",
  "INTERNAL",
] as const;

/*
 * Replies (AUTH-07c, grill A3): not strict. Fields a newer extension may add are ignored; the
 * known fields are still validated. A receiver parses `ProtocolEnvelopeSchema` first.
 */
export const ExtensionErrorSchema = z.object({
  ok: z.literal(false),
  code: z.enum(EXTENSION_ERROR_CODES),
  protocolVersion: ProtocolVersionSchema,
});

/** Reply to PING and STATUS (AUTH-07a). `email` only when connected. */
export const ExtensionStatusReplySchema = z.object({
  ok: z.literal(true),
  protocolVersion: ProtocolVersionSchema,
  extensionVersion: z.string().min(1),
  connected: z.boolean(),
  email: z.email().optional(),
});

/** Reply to CONNECT and DISCONNECT. */
export const ExtensionAckReplySchema = z.object({
  ok: z.literal(true),
  protocolVersion: ProtocolVersionSchema,
  email: z.email().optional(),
});

export type ExtensionError = z.infer<typeof ExtensionErrorSchema>;
export type ExtensionStatusReply = z.infer<typeof ExtensionStatusReplySchema>;
export type ExtensionAckReply = z.infer<typeof ExtensionAckReplySchema>;
