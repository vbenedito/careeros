/**
 * Coding problem detection (LeetCode, NeetCode) (specs/v1/01-problems.md PRB-05, PRB-06) and
 * problem rules of added sites (specs/v1/05-problem-sites.md PSR-05..12, PSR-17, PSR-25).
 *
 * Pure: the caller passes the URL it already holds in memory and the tracked domain the tab was
 * matched to (TRK-03). Only the slug is returned; the rest of the URL is never kept.
 */
import { PROBLEMS } from "./constants";
import { hostnameFromUrl, matchTrackedDomain } from "./domain";

/** PRB-18: is this tracked domain one of the sites whose tabs can carry a problem? */
export function isProblemDomain(domain: string | null | undefined): boolean {
  return domain != null && (PROBLEMS.PROBLEM_DOMAINS as readonly string[]).includes(domain);
}

/** PRB-05.3: a slug as stored: the pattern and at most PROBLEM_SLUG_MAX characters. */
export function isValidProblemSlug(slug: string): boolean {
  return slug.length <= PROBLEMS.PROBLEM_SLUG_MAX && PROBLEMS.PROBLEM_SLUG_PATTERN.test(slug);
}

/**
 * PRB-05: the problem slug of a tab, or null. `trackedDomain` is the tracked domain the tab's
 * hostname matched by the TRK-03 rule (longest match): it must be one of PROBLEM_DOMAINS
 * itself, so `www.neetcode.io` (tracked as `neetcode.io`) counts and `leetcode.cn`,
 * `notneetcode.io` or a tracked `app.neetcode.io` never do. The slug belongs to that domain
 * (PRB-19). The path must start
 * with PROBLEM_PATH_PREFIX; its next segment is the slug, taken as it is (never lowercased or
 * trimmed). The setting check (PRB-05.1) is the caller's.
 */
export function problemSlugFromUrl(
  url: string | undefined,
  trackedDomain: string | null,
): string | null {
  if (!url || !isProblemDomain(trackedDomain)) return null;
  let path: string;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    path = parsed.pathname;
  } catch {
    return null;
  }
  if (!path.startsWith(PROBLEMS.PROBLEM_PATH_PREFIX)) return null;
  const rest = path.slice(PROBLEMS.PROBLEM_PATH_PREFIX.length);
  const end = rest.indexOf("/");
  const slug = end === -1 ? rest : rest.slice(0, end);
  return isValidProblemSlug(slug) ? slug : null;
}

// ---------------------------------------------------------------------------------------------
// Problem rules (specs/v1/05-problem-sites.md)
// ---------------------------------------------------------------------------------------------

export type ProblemIdKind = (typeof PROBLEMS.PROBLEM_ID_KINDS)[number];

/** PSR-01: a rule as the matcher reads it (the label is the dashboard's, not the matcher's). */
export interface ProblemRule {
  domain: string;
  prefix: readonly string[];
  kind: ProblemIdKind;
  label?: string | undefined;
}

/** PSR-07, O6: kind `id`: the pattern and at most PROBLEM_ID_MAX characters. */
export function isValidProblemId(id: string): boolean {
  return id.length <= PROBLEMS.PROBLEM_ID_MAX && PROBLEMS.PROBLEM_ID_PATTERN.test(id);
}

/** PSR-07: one of the two fixed patterns, chosen by the rule's kind. */
export function isValidProblemIdOfKind(kind: ProblemIdKind, id: string): boolean {
  // The database checks every id of a user domain with the `id` pattern and PROBLEM_ID_MAX
  // whatever the kind (ingest and trigger), so a slug rule also needs that: at most 64.
  return isValidProblemId(id) && (kind === "id" || isValidProblemSlug(id));
}

/** PSR-06: one literal prefix segment. */
export function isValidRuleSegment(segment: string): boolean {
  return (
    segment.length <= PROBLEMS.PROBLEM_RULE_SEGMENT_MAX &&
    PROBLEMS.PROBLEM_RULE_SEGMENT_PATTERN.test(segment)
  );
}

/**
 * PSR-07, PRB-08: what a stored problem must look like on a domain: a slug on a built-in domain,
 * an id on any other: the database limit (PROBLEM_ID_PATTERN, PROBLEM_ID_MAX) applies to every
 * user domain, also for slug rules (the server decides by the account's rules, PSR-23).
 */
export function isValidProblemForDomain(domain: string, problem: string): boolean {
  return isProblemDomain(domain) ? isValidProblemSlug(problem) : isValidProblemId(problem);
}

/** PSR-06: the path as the browser gives it, split on `/`, empty segments dropped, not decoded. */
function pathSegments(parsed: URL): string[] {
  return parsed.pathname.split("/").filter((segment) => segment !== "");
}

function parseWebUrl(url: string | undefined): URL | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * PSR-05..09, PSR-17: the problem id of a tab, or null. Built on `problemSlugFromUrl`: a built-in
 * domain (LeetCode, NeetCode) keeps exactly its PRB-05 result. For any other tracked domain,
 * only `rules` of that domain count: `trackedDomain` (the tab's TRK-03 match) must EQUAL the
 * rule's domain, so lookalikes and a subdomain tracked as another site give nothing (PSR-05).
 * The first n path segments must equal the rule's n literal segments; among the rules that do,
 * the longest prefix wins (PSR-09); the next segment is the id and must fit the kind's fixed
 * pattern and limit, else there is no problem (PSR-07). Nothing is lowercased, trimmed or
 * decoded. The query and the fragment are never read (PSR-08). No RegExp is built from a rule.
 * The setting check (PRB-04, PSR-03) is the caller's.
 */
export function problemIdFromUrl(
  url: string | undefined,
  trackedDomain: string | null,
  rules: readonly ProblemRule[],
): string | null {
  if (trackedDomain === null) return null;
  if (isProblemDomain(trackedDomain)) return problemSlugFromUrl(url, trackedDomain);
  const parsed = parseWebUrl(url);
  if (!parsed) return null;
  const segments = pathSegments(parsed);
  let best: ProblemRule | null = null;
  for (const rule of rules) {
    if (rule.domain !== trackedDomain) continue;
    const n = rule.prefix.length;
    if (n < PROBLEMS.PROBLEM_RULE_PREFIX_MIN || n > PROBLEMS.PROBLEM_RULE_PREFIX_MAX) continue;
    if (segments.length <= n) continue;
    if (!rule.prefix.every((literal, i) => segments[i] === literal)) continue;
    if (best === null || n > best.prefix.length) best = rule;
  }
  if (best === null) return null;
  const id = segments[best.prefix.length] as string;
  return isValidProblemIdOfKind(best.kind, id) ? id : null;
}

/** PSR-25: the reasons to warn before a rule is confirmed. */
export interface ProblemRuleWarning {
  /** A prefix segment is in PROBLEM_RULE_RISKY_SEGMENTS (`u`, `in`, `d`, ...). */
  riskySegment: boolean;
  /** The id is long, has letters and digits and no `-` or `_`. */
  looksRandom: boolean;
}

/** PSR-25 step 1: pure; `prefix` and `id` are as proposed. */
export function problemRuleWarning(prefix: readonly string[], id: string): ProblemRuleWarning {
  const risky = PROBLEMS.PROBLEM_RULE_RISKY_SEGMENTS as readonly string[];
  return {
    riskySegment: prefix.some((segment) => risky.includes(segment)),
    looksRandom:
      id.length >= PROBLEMS.PROBLEM_ID_RANDOM_MIN &&
      /[A-Za-z]/.test(id) &&
      /[0-9]/.test(id) &&
      !/[-_]/.test(id),
  };
}

export type ProposeProblemRuleResult =
  | {
      ok: true;
      domain: string;
      prefix: string[];
      kind: "id";
      /** The id the rule would keep. */
      id: string;
      /** Index in `segments` of the proposed id. */
      idIndex: number;
      /** Indexes of the segments the user may pick as the id instead. */
      candidates: number[];
      segments: string[];
      /** PSR-12 step 4: what is not kept (query, fragment, segments after the id), shown in the page only. */
      notKept: string;
      warning: ProblemRuleWarning;
      /** True when `warning` has any reason (PSR-25 step 1). */
      warn: boolean;
    }
  | {
      ok: false;
      reason: "not_http" | "no_tracked_domain" | "built_in" | "no_candidate" | "bad_choice";
    };

/**
 * PSR-12 steps 1..3 and PSR-25 step 1, pure: the example URL is parsed in the page and never
 * leaves the browser (PSR-11). Proposes the **last** path segment that fits the `id` pattern and
 * limit and has 1..3 valid literal segments before it; `pickIndex` chooses another segment, which
 * must be one of `candidates` (else `bad_choice`).
 */
export function proposeProblemRule(
  url: string,
  trackedDomains: readonly string[],
  pickIndex?: number,
): ProposeProblemRuleResult {
  const parsed = parseWebUrl(url);
  if (!parsed) return { ok: false, reason: "not_http" };
  const hostname = hostnameFromUrl(url);
  const domain = hostname ? matchTrackedDomain(hostname, trackedDomains) : null;
  if (domain === null) return { ok: false, reason: "no_tracked_domain" };
  if (isProblemDomain(domain)) return { ok: false, reason: "built_in" };
  const segments = pathSegments(parsed);
  const candidates: number[] = [];
  for (let i = PROBLEMS.PROBLEM_RULE_PREFIX_MIN; i <= PROBLEMS.PROBLEM_RULE_PREFIX_MAX; i++) {
    const segment = segments[i];
    if (segment === undefined || !isValidProblemId(segment)) continue;
    if (segments.slice(0, i).every(isValidRuleSegment)) candidates.push(i);
  }
  if (candidates.length === 0) return { ok: false, reason: "no_candidate" };
  const idIndex = pickIndex ?? (candidates[candidates.length - 1] as number);
  if (!candidates.includes(idIndex)) return { ok: false, reason: "bad_choice" };
  const prefix = segments.slice(0, idIndex);
  const id = segments[idIndex] as string;
  const after = segments.slice(idIndex + 1);
  const notKept = `${after.length > 0 ? `/${after.join("/")}` : ""}${parsed.search}${parsed.hash}`;
  const warning = problemRuleWarning(prefix, id);
  return {
    ok: true,
    domain,
    prefix,
    kind: "id",
    id,
    idIndex,
    candidates,
    segments,
    notKept,
    warning,
    warn: warning.riskySegment || warning.looksRandom,
  };
}
