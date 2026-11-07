/**
 * Viewer time zone (DASH-07). Server Components cannot see the browser's zone, so a tiny client
 * component stores it in the `tz` cookie; the server validates it before using it.
 */
export const TZ_COOKIE = "tz";
export const FALLBACK_TZ = "UTC";

/** True for an IANA zone the runtime knows (the database checks again, DATA-10). */
export function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 64) return false;
  if (!/^[A-Za-z0-9_+\-/]+$/.test(value)) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function resolveTimeZone(cookieValue: string | undefined): string {
  return isValidTimeZone(cookieValue) ? cookieValue : FALLBACK_TZ;
}

/** Today's date (YYYY-MM-DD) in `timeZone`. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return parts; // en-CA formats as YYYY-MM-DD
}
