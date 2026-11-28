/**
 * Problem sites in the dashboard (DASH-16, DASH-17, PSR-11..14, PSR-25): the API contract shared
 * by the routes and the browser, the pure view-model of the add form and the list, and every
 * text. Pure. The example URL is parsed in the page by `proposeProblemRule` and never reaches
 * these schemas (PSR-11): only the rule does.
 */
import {
  PROBLEMS,
  type ProblemRule,
  ProblemRuleSchema,
  type ProposeProblemRuleResult,
} from "@careeros/shared";
import { z } from "zod";

/** The gate of everything in this file (ENV-05c, PSR-21). */
export const PROBLEM_RULES_FEATURE = "problemRules" as const;

// ---------------------------------------------------------------------------------------------
// API contract
// ---------------------------------------------------------------------------------------------

/**
 * POST /api/settings/problem-rules. A rule (PSR-01) plus the PSR-25 confirmation, nothing else:
 * no URL, no query, no fragment. User rules are kind `id` (PSR-07).
 */
export const AddProblemRuleRequestSchema = z
  .object({
    domain: z.string().max(253),
    prefix: z
      .array(z.string().max(PROBLEMS.PROBLEM_RULE_SEGMENT_MAX))
      .max(PROBLEMS.PROBLEM_RULE_PREFIX_MAX),
    kind: z.literal("id"),
    label: z.string().max(PROBLEMS.PROBLEM_RULE_LABEL_MAX),
    confirmedProblemId: z.literal(true),
  })
  .strict()
  .superRefine((body, ctx) => {
    // PSR-16: the same shared schema as the extension and the database.
    if (
      !ProblemRuleSchema.safeParse({ domain: body.domain, prefix: body.prefix, kind: body.kind })
        .success
    ) {
      ctx.addIssue({ code: "custom", message: "Invalid rule" });
    }
  });
export type AddProblemRuleRequest = z.infer<typeof AddProblemRuleRequestSchema>;

export const AddProblemRuleReplySchema = z.object({ id: z.string().uuid() }).strict();

/** DELETE /api/settings/problem-rules/:id (PSR-13). */
export const RemoveProblemRuleRequestSchema = z.object({ deleteHistory: z.boolean() }).strict();
export const RemoveProblemRuleReplySchema = z.object({ id: z.string().uuid() }).strict();

/** A row of `problem_rules` as Settings reads it under RLS (active rules only, PSR-22). */
export const ProblemRuleRowSchema = z.object({
  id: z.string().uuid(),
  domain: z.string(),
  prefix: z.array(z.string()),
  label: z.string().nullable(),
});
export type ProblemRuleRow = z.infer<typeof ProblemRuleRowSchema>;

/** What the list needs; only booleans about stored ids leave the server (DASH-16). */
export interface ProblemSiteRule {
  id: string;
  domain: string;
  prefix: string[];
  label: string;
  /** The domain has stored problem ids (PSR-13: no dialog when false). */
  hasHistory: boolean;
  /** Other active rules on the same domain share the history (PSR-13). */
  sharesDomain: boolean;
}

/** Rows → list items: label falls back to the domain (PSR-01); ordered by domain, then prefix. */
export function problemSiteRules(
  rows: readonly ProblemRuleRow[],
  domainsWithHistory: ReadonlySet<string>,
): ProblemSiteRule[] {
  const perDomain = new Map<string, number>();
  for (const row of rows) perDomain.set(row.domain, (perDomain.get(row.domain) ?? 0) + 1);
  const key = (r: ProblemRuleRow) => `${r.domain}/${r.prefix.join("/")}`;
  return [...rows]
    .sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0))
    .map((row) => ({
      id: row.id,
      domain: row.domain,
      prefix: row.prefix,
      label: row.label?.trim() || row.domain,
      hasHistory: domainsWithHistory.has(row.domain),
      sharesDomain: (perDomain.get(row.domain) ?? 0) > 1,
    }));
}

/** PSR-14: domain → label for the dashboard rows. With several rules the first one in list order wins. */
export function ruleLabels(rules: readonly ProblemSiteRule[]): Map<string, string> {
  const labels = new Map<string, string>();
  for (const rule of rules) if (!labels.has(rule.domain)) labels.set(rule.domain, rule.label);
  return labels;
}

// ---------------------------------------------------------------------------------------------
// View-model
// ---------------------------------------------------------------------------------------------

/** "hellointerview.com/practice/system-design/…" (PSR-12 step 4, PSR-13). */
export function ruleAddress(rule: Pick<ProblemRule, "domain" | "prefix">): string {
  return `${rule.domain}/${rule.prefix.join("/")}/…`;
}

/** The proposal of PSR-12 as the preview shows it. */
export function previewLines(proposal: Extract<ProposeProblemRuleResult, { ok: true }>) {
  return {
    keep: proposal.id,
    // The rest of the address, in the page only (PSR-11). Empty when nothing follows the id.
    notKept: proposal.notKept,
    rule: ruleAddress(proposal),
  };
}

/** The label sent to the server: what the user typed, trimmed; empty means the domain (PSR-01). */
export function labelToSend(typed: string, domain: string): string {
  const label = typed.trim();
  return label === "" ? domain : label;
}

/** The add button needs the confirmation (PSR-25) and a label that fits (PSR-01). */
export function canAddRule(confirmed: boolean, label: string): boolean {
  return confirmed && label.trim().length <= PROBLEMS.PROBLEM_RULE_LABEL_MAX;
}

/** PSR-14: "abcdef…uvwxyz" for a long id; short ids stay whole. Full id goes in the tooltip. */
export function shortenMiddle(id: string, max = 16): string {
  if (id.length <= max) return id;
  const head = Math.ceil((max - 1) / 2);
  const tail = Math.floor((max - 1) / 2);
  return `${id.slice(0, head)}…${id.slice(id.length - tail)}`;
}

/** PSR-13: does Remove ask first? Only when the domain has stored ids. */
export function removeNeedsDialog(rule: Pick<ProblemSiteRule, "hasHistory">): boolean {
  return rule.hasHistory;
}

// ---------------------------------------------------------------------------------------------
// Texts (copy review: every string here is new)
// ---------------------------------------------------------------------------------------------

export const SITE_COPY = {
  title: "Problem sites",
  intro:
    "LeetCode and NeetCode are built in. Add another site to save its problem id with your study time. Track coding problems must be on.",
  /** PSR-12: always shown under the list. */
  versionNote:
    "Problem sites you add need CareerOS extension 0.4.0 or later. Chrome updates extensions on its own; until then, time on these sites is still tracked, without problem names.",
  builtInTag: "Built in",
  builtInHelp: "Built-in sites can't be removed.",
  listTitle: "Your problem sites",
  empty: "You haven't added a problem site yet.",
  addTitle: "Add a problem site",
  addHelp:
    "Paste the address of one problem page. It is read in your browser only. It is never sent or stored.",
  urlLabel: "Example address",
  urlPlaceholder: "https://example.com/practice/problem-name/abc123",
  check: "Check address",
  pickLegend: "Which part is the problem id?",
  keepPrefix: "We will keep:",
  notKeptPrefix: "We never keep:",
  notKeptRest: "the rest of the address",
  rulePrefix: "Pages under",
  warning:
    "This part of the address may name a person, an account or a private link. Only continue if it names a problem.",
  labelLabel: "Name for this site",
  labelHelp: "Shown next to the id on your dashboard. Up to 40 characters.",
  confirm:
    "This part of the address names a problem. It is not a person, an account or a private link.",
  add: "Add problem site",
  addTrackedSite: (host: string) => `Add ${host} as a study site`,
  remove: (label: string) => `Remove ${label}`,
  dialogTitle: (label: string) => `Remove ${label}?`,
  dialogBody: (domain: string) =>
    `Keep or delete the problem ids saved for ${domain}. Your study time stays either way.`,
  dialogShared: (domain: string) =>
    `Other problem sites on ${domain} share this history, so deleting it affects them too.`,
  keepHistory: "Remove and keep history",
  deleteHistory: "Remove and delete history",
  cancel: "Cancel",
} as const;

/** Why a proposal failed (PSR-12 steps 1 and 2), one sentence each. */
export function proposalFailure(
  reason: Extract<ProposeProblemRuleResult, { ok: false }>["reason"],
  host: string | null,
  domain?: string | null,
): string {
  switch (reason) {
    case "not_http":
      return "Use an address that starts with http:// or https://.";
    case "no_tracked_domain":
      return `${host ?? "This site"} is not one of your tracked sites yet. Add it as a study site first.`;
    case "built_in":
      return `${domain ?? host ?? "This site"} is already supported. You don't need to add it.`;
    default:
      return `This address has no problem id that CareerOS can use. The id is one part of the address, after 1 to ${PROBLEMS.PROBLEM_RULE_PREFIX_MAX} other parts. It can use letters, digits, - and _, up to ${PROBLEMS.PROBLEM_ID_MAX} characters.`;
  }
}

/**
 * `limit` is the number from the server's limit error (ENT-07), never a shared constant.
 * `action` picks the fallback line of the failed call.
 */
export function problemSiteErrorMessage(
  code: string | undefined,
  status: number | null,
  limit?: number,
  action: "add" | "remove" = "add",
): string {
  if (status === null) return "Couldn't reach CareerOS. Check your connection and try again.";
  switch (code) {
    case "NOT_AUTHENTICATED":
      return "Your session ended. Sign in again.";
    case "LIMIT_REACHED":
      return limit === undefined
        ? "You've reached the limit of problem sites. Remove one to add another."
        : `You can add up to ${limit} problem sites. Remove one to add another.`;
    case "DUPLICATE_RULE":
      return "You already added this part of the site. Remove it first to change it.";
    case "DOMAIN_NOT_TRACKED":
      return "Add this site to your tracked sites first.";
    case "BUILT_IN_DOMAIN":
      return "This site is already supported. You don't need to add it.";
    case "CONFIRMATION_REQUIRED":
      return "Tick the box to confirm that the id names a problem.";
    case "INVALID_REQUEST":
      return "This address can't be used as a problem site. Check it and try again.";
    case "NOT_FOUND":
      return action === "remove"
        ? "This problem site is already gone. Reload the page."
        : "Couldn't save this problem site. Try again in a moment.";
    default:
      return action === "remove"
        ? "Couldn't remove this problem site. Try again in a moment."
        : "Couldn't save this problem site. Try again in a moment.";
  }
}

/** PSR-18 / SEC-13: the texts of the privacy page and the landing page (live with problemRules). */
export const SITE_PRIVACY = {
  tableData:
    "Only on the problem sites you add: the problem id (one part of the address), saved with the study period. The rules you add (the site, the parts of the address before the id, and a name) are saved with your account. The address you paste is read in your browser and is never stored",
  tableWhy: "Showing your time per problem on sites you add",
  /** Replaces the "problem name" phrase in the "Nothing else" paragraph. */
  nothingElse: "the problem name or id described below",
  sectionTitle: "Problem sites you add",
  paragraphs: [
    "You can add a site in Settings by pasting one example address. The page reads the address in your browser and shows what would be kept. The address you paste is not stored, not sent and not logged. Only the rule is saved with your account: the site, the parts of the address before the id, the kind of id and the name you type. The extension then keeps only that one part of the address (the problem id) with your study time. The rest of the address, including anything after ? or #, is never stored or sent.",
    "Only add pages where the address names a problem. Do not add pages whose address names a person, an account or a private link (for example a profile page or a shared document): CareerOS would store that part of the address as the problem id. You can remove a problem site and its history at any time.",
    "When you remove a site, you choose to keep or delete the problem ids saved for it. Your study time stays either way. Deleting your account removes your rules and all problem ids.",
  ],
} as const;
