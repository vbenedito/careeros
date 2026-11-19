/**
 * ADM-06: schema version 1 of one session's ledger file. The files live in a private repository
 * and are validated on the server; a file that fails is listed as invalid and never shown
 * half-read (ADM-06), so every object here is strict: an unknown key is a failure.
 */
import { z } from "zod";

export const LEDGER_SCHEMA_VERSION = 1;

export const LEDGER_MODELS = ["haiku", "sonnet", "opus"] as const;
export const LEDGER_WORK = ["author", "review", "fix", "other"] as const;
export const LEDGER_KINDS = ["code", "docs", "marketing", "video", "post"] as const;
export const LEDGER_MEASURES = ["estimate", "measured"] as const;

export type LedgerModel = (typeof LEDGER_MODELS)[number];

const Count = z.number().int().nonnegative();
const Id = z.number().int().positive();

export const LedgerAgentSchema = z
  .object({
    model: z.enum(LEDGER_MODELS),
    work: z.enum(LEDGER_WORK),
    kind: z.enum(LEDGER_KINDS),
    issue: Id.nullable(),
    pr: Id.nullable(),
    tokens: Count,
    minutes: Count.nullable(),
    rounds: Id,
    findings: z.object({ high: Count, medium: Count }).strict().nullable(),
    files: z.array(z.string().min(1)),
    skills: z.array(z.string().min(1)),
  })
  .strict();

export const LedgerSessionSchema = z
  .object({
    schema: z.literal(LEDGER_SCHEMA_VERSION),
    /** `YYYY-MM-DD-<slug>`, unique per file. */
    session: z.string().regex(/^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/),
    date: z.iso.date(),
    goal: z.string().min(1),
    /** The `session` id of the file this one corrects (ADM-05), or null. */
    corrects: z.string().nullable(),
    main: z
      .object({
        tokens: Count.nullable(),
        measure: z.enum(LEDGER_MEASURES),
      })
      .strict(),
    agents: z.array(LedgerAgentSchema),
  })
  .strict();

export type LedgerAgent = z.infer<typeof LedgerAgentSchema>;
export type LedgerSession = z.infer<typeof LedgerSessionSchema>;
