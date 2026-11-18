/**
 * PRB-12: the display name of a LeetCode problem, built from its slug by one exact rule: split on
 * hyphens, upper-case the first character of each part, keep the rest as it is, join the parts
 * with one space. `two-sum` → "Two Sum", `3sum` → "3sum", `lru-cache` → "Lru Cache". The real
 * LeetCode title is never fetched. Used by the dashboard list and the popup.
 */
export function problemName(slug: string): string {
  return slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
