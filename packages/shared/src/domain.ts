/**
 * Tracked-domain rules (TRK-02, TRK-03, EXT-UI-05/07, DATA §1).
 *
 * A tracked domain is a normalized hostname: lowercase, no trailing dot, no leading `www.`,
 * valid DNS labels, at least two labels, and not an IP address. No public-suffix logic:
 * `docs.python.org` stays `docs.python.org`.
 */
import { DATA } from "./constants";

/**
 * One DNS label: 1–63 chars of a–z, 0–9 and hyphens, not starting or ending with a hyphen.
 * The same pattern is used by the database CHECK constraint on `domain` columns (#5).
 */
const LABEL = "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?";

/**
 * Hostname with at least two labels whose last label is alphabetic or punycode (rejects IPv4).
 * On its own it still allows `www.`; `isValidDomain` and the DB domain type also require no
 * leading `www.` and at most 253 characters.
 */
export const DOMAIN_PATTERN = new RegExp(
  `^(?:${LABEL}\\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{0,58}[a-z0-9])$`,
);

/** Lowercases, trims, removes one trailing dot and one leading `www.`. Does not validate. */
export function normalizeHostname(hostname: string): string {
  let host = hostname.trim().toLowerCase();
  if (host.endsWith(".")) host = host.slice(0, -1);
  if (host.startsWith("www.")) host = host.slice(4);
  return host;
}

/** True when `domain` is already a valid, normalized tracked domain. */
export function isValidDomain(domain: string): boolean {
  return (
    domain.length <= DATA.MAX_DOMAIN_LENGTH &&
    DOMAIN_PATTERN.test(domain) &&
    normalizeHostname(domain) === domain
  );
}

/**
 * TRK-02: derives the normalized hostname of an http(s) URL. Returns null for any other scheme
 * or an unparsable URL. Path, query and fragment are never returned.
 */
export function hostnameFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  const host = normalizeHostname(parsed.hostname);
  return host.length > 0 ? host : null;
}

/**
 * TRK-03: returns the tracked domain that `hostname` belongs to, or null.
 * Matches when the hostname equals the domain or is a subdomain of it; the longest match wins.
 */
export function matchTrackedDomain(
  hostname: string,
  trackedDomains: readonly string[],
): string | null {
  const host = normalizeHostname(hostname);
  let best: string | null = null;
  for (const domain of trackedDomains) {
    if (
      (host === domain || host.endsWith(`.${domain}`)) &&
      (!best || domain.length > best.length)
    ) {
      best = domain;
    }
  }
  return best;
}

export type ParseDomainResult = { ok: true; domain: string } | { ok: false; error: string };

/**
 * EXT-UI-07 / DASH-12: parses what a user typed into "add site" — a bare host
 * (`LeetCode.com`) or a URL (`https://www.leetcode.com/problems/x`) — into a tracked domain.
 */
export function parseDomainInput(input: string): ParseDomainResult {
  const raw = input.trim();
  if (raw.length === 0) return { ok: false, error: "Enter a site, e.g. leetcode.com" };
  // A bare "user@host" or "mailto:" is not a website address.
  if (raw.includes("@")) return { ok: false, error: "That doesn't look like a website address" };
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw)
    ? hostnameFromUrl(raw)
    : hostnameFromUrl(`https://${raw}`);
  if (!candidate || !isValidDomain(candidate)) {
    return { ok: false, error: "That doesn't look like a website address" };
  }
  return { ok: true, domain: candidate };
}
