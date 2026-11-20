/**
 * Validation schemas shared by the extension and the dashboard (SEC-10).
 * The database re-validates everything (DATA-07); these schemas are the first boundary.
 */
import { z } from "zod";
import { DATA, ENTITLEMENTS, TRACKING } from "./constants";
import { isValidDomain } from "./domain";
import { isProblemDomain, isValidProblemSlug } from "./problems";

export const DomainSchema = z
  .string()
  .refine(isValidDomain, { message: "Invalid or non-normalized domain" });

/** UTC ISO-8601 with whole seconds, e.g. `2026-11-05T09:30:00Z` (TRK-10). */
export const UtcSecondsSchema = z.iso.datetime({ precision: 0 });

const MAX_ACCEPTED_S = TRACKING.MAX_INTERVAL_S + DATA.INTERVAL_TOLERANCE_S;

/** PRB-05: a LeetCode problem slug (pattern and PROBLEM_SLUG_MAX). */
export const ProblemSlugSchema = z
  .string()
  .refine(isValidProblemSlug, { message: "Invalid problem slug" });

/**
 * TRK-10 closed interval, as stored in the outbox and sent to `ingest_study_sessions_v2`.
 * MIN_INTERVAL_S is not enforced here: the engine discards short intervals before they are
 * stored (TRK-10), and the server only requires a positive duration (DATA-02).
 * PRB-08: `problem` is present only when the interval has one, and only on a domain of
 * PROBLEM_DOMAINS (PRB-18, PRB-15); an interval without a problem has exactly the 0.2.3 shape.
 */
export const IntervalSchema = z
  .object({
    id: z.uuid({ version: "v4" }),
    device_id: z.uuid(),
    domain: DomainSchema,
    started_at: UtcSecondsSchema,
    ended_at: UtcSecondsSchema,
    problem: ProblemSlugSchema.optional(),
  })
  .strict()
  .superRefine((interval, ctx) => {
    if (interval.problem !== undefined && !isProblemDomain(interval.domain)) {
      ctx.addIssue({ code: "custom", message: "problem only on the problem domain" });
    }
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

/**
 * ENT-05, ENT-07: the `details` of a limit error, `{"code":"LIMIT_REACHED","limit":12,"plan":"free"}`.
 * Fields a later database adds are ignored (additive contract, ENT-06). The number and the plan
 * always come from here, never from a shared constant at run time.
 */
export const LimitErrorDetailsSchema = z.object({
  code: z.literal(ENTITLEMENTS.LIMIT_ERROR_CODE),
  limit: z.number().int().positive(),
  plan: z.string().min(1),
});
export type LimitErrorDetails = z.infer<typeof LimitErrorDetailsSchema>;

/**
 * ENT-07: reads the limit error details as PostgREST returns them (a JSON string, or an object
 * when a client already parsed it). Missing or invalid details give null: the caller still
 * reports LIMIT_REACHED from the hint, with a message without a number.
 */
export function parseLimitErrorDetails(details: unknown): LimitErrorDetails | null {
  let value: unknown = details;
  if (typeof details === "string") {
    try {
      value = JSON.parse(details);
    } catch {
      return null;
    }
  }
  const parsed = LimitErrorDetailsSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

// ---------------------------------------------------------------------------------------------
// Ingest v2 reply (DATA-06b, SYNC-05c, ADR-0011)
// ---------------------------------------------------------------------------------------------

/** DATA-06b: why the server rejected an id. */
export const INGEST_REJECT_REASONS = ["invalid", "future", "overlap"] as const;
export type IngestRejectReason = (typeof INGEST_REJECT_REASONS)[number];

/**
 * `ingest_study_sessions_v2` returns `{"confirmed": [uuid], "rejected": [{"id", "reason"}]}`.
 * Not strict: keys a later database adds are ignored. A reason this client does not know is read
 * as `invalid` (quarantined: kept, never lost) by `parseIngestV2Reply`.
 */
export const IngestV2ReplySchema = z.object({
  confirmed: z.array(z.string()),
  rejected: z.array(z.object({ id: z.string(), reason: z.string() })),
});

export interface IngestV2Reply {
  confirmed: string[];
  rejected: { id: string; reason: IngestRejectReason }[];
}

/** SYNC-05c: the reply, or null when it does not have the v2 shape (a call error). */
export function parseIngestV2Reply(value: unknown): IngestV2Reply | null {
  const parsed = IngestV2ReplySchema.safeParse(value);
  if (!parsed.success) return null;
  const known = (r: string): r is IngestRejectReason =>
    (INGEST_REJECT_REASONS as readonly string[]).includes(r);
  return {
    confirmed: parsed.data.confirmed,
    rejected: parsed.data.rejected.map(({ id, reason }) => ({
      id,
      reason: known(reason) ? reason : "invalid",
    })),
  };
}
