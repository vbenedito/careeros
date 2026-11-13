/**
 * Escape hatch of the dependency audit (ENV-08, grill T7). `pnpm audit --prod --audit-level=high`
 * fails CI on a new advisory; when no fix exists yet, an advisory can be ignored for a limited
 * time by adding it to `.github/audit-exceptions.json`:
 *   { "GHSA-xxxx-xxxx-xxxx": { "reason": "why it does not apply or cannot be fixed", "expires": "YYYY-MM-DD" } }
 * `scripts/ci/audit.ts` passes the valid entries to `pnpm audit --ignore` and FAILS once an entry
 * has expired, so an exception cannot be forgotten. See docs/process/release.md.
 */
export interface AuditException {
  reason: string;
  expires: string;
}

const GHSA = /^GHSA(-[2-9cfghjmpqrvwx]{4}){3}$/;
/** An exception may last at most this long; renew it deliberately. */
export const MAX_EXCEPTION_DAYS = 90;

/** Problems with the exception list at `today` (YYYY-MM-DD); empty when every entry is valid. */
export function exceptionProblems(data: unknown, today: string): string[] {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return ["audit-exceptions.json must be an object of GHSA id -> { reason, expires }."];
  }
  const problems: string[] = [];
  const limit = new Date(`${today}T00:00:00Z`).getTime() + MAX_EXCEPTION_DAYS * 86_400_000;
  for (const [id, entry] of Object.entries(data)) {
    const e = entry as Partial<AuditException> | null;
    if (!GHSA.test(id)) problems.push(`${id}: not a GHSA id.`);
    if (!e || typeof e.reason !== "string" || e.reason.trim().length < 10) {
      problems.push(`${id}: needs a reason (at least 10 characters).`);
    }
    if (!e || typeof e.expires !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(e.expires)) {
      problems.push(`${id}: needs an expiry date (YYYY-MM-DD).`);
    } else if (e.expires < today) {
      problems.push(
        `${id}: the exception expired on ${e.expires}; fix the dependency or renew it with a new reason.`,
      );
    } else if (new Date(`${e.expires}T00:00:00Z`).getTime() > limit) {
      problems.push(`${id}: expires more than ${MAX_EXCEPTION_DAYS} days ahead.`);
    }
  }
  return problems;
}
