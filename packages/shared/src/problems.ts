/**
 * LeetCode problem detection (specs/v1/01-problems.md PRB-05, PRB-06).
 *
 * Pure: the caller passes the URL it already holds in memory and the tracked domain the tab was
 * matched to (TRK-03). Only the slug is returned; the rest of the URL is never kept.
 */
import { PROBLEMS } from "./constants";

/** PRB-05.3: a slug as stored: the pattern and at most PROBLEM_SLUG_MAX characters. */
export function isValidProblemSlug(slug: string): boolean {
  return slug.length <= PROBLEMS.PROBLEM_SLUG_MAX && PROBLEMS.PROBLEM_SLUG_PATTERN.test(slug);
}

/**
 * PRB-05: the problem slug of a tab, or null. `trackedDomain` is the tracked domain the tab's
 * hostname matched by the TRK-03 rule (longest match): it must be PROBLEM_DOMAIN itself, so
 * `www.leetcode.com` counts and `leetcode.cn` or `notleetcode.com` never do. The path must start
 * with PROBLEM_PATH_PREFIX; its next segment is the slug, taken as it is (never lowercased or
 * trimmed). The setting check (PRB-05.1) is the caller's.
 */
export function problemSlugFromUrl(
  url: string | undefined,
  trackedDomain: string | null,
): string | null {
  if (!url || trackedDomain !== PROBLEMS.PROBLEM_DOMAIN) return null;
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
