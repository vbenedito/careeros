/**
 * Coding problem detection (LeetCode, NeetCode) (specs/v1/01-problems.md PRB-05, PRB-06).
 *
 * Pure: the caller passes the URL it already holds in memory and the tracked domain the tab was
 * matched to (TRK-03). Only the slug is returned; the rest of the URL is never kept.
 */
import { PROBLEMS } from "./constants";

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
