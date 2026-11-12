"use client";

import { Globe } from "lucide-react";
import { useRouter } from "next/navigation";
import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import { TZ_COOKIE } from "@/lib/dashboard/time-zone";

const ONE_YEAR_S = 60 * 60 * 24 * 365;
export const REFRESH_TIMEOUT_MS = 8000;

function readCookie(name: string): string | undefined {
  return document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

/**
 * Writes the browser's zone to the `tz` cookie when it differs. Returns true when the server
 * must render again (the cookie changed and the write stuck, so a blocked cookie can never
 * cause a reload loop).
 */
export function syncTimeZoneCookie(zone: string | undefined): boolean {
  if (!zone || decodeURIComponent(readCookie(TZ_COOKIE) ?? "") === zone) return false;
  // biome-ignore lint/suspicious/noDocumentCookie: a plain, non-sensitive preference cookie
  document.cookie = `${TZ_COOKIE}=${encodeURIComponent(zone)}; path=/; max-age=${ONE_YEAR_S}; samesite=lax`;
  return decodeURIComponent(readCookie(TZ_COOKIE) ?? "") === zone;
}

/**
 * How the server picked the zone for this render:
 * - `viewer`: the `tz` cookie, accepted by the database;
 * - `unresolved`: no cookie yet (first visit), so the server used UTC;
 * - `fallback`: the cookie's zone is unusable (invalid, or unknown to the database), so the
 *   server used UTC.
 */
export type TimeZoneStatus = "viewer" | "unresolved" | "fallback";

const UtcContext = createContext(false);

/**
 * DASH-07 (#70): writes the browser's IANA time zone to the `tz` cookie and refreshes the page
 * once when it was missing or different, so the server aggregates days in the viewer's zone.
 *
 * On a first visit (`unresolved`) the server's UTC render stays behind `skeleton` until the
 * refreshed page arrives, so the viewer never sees UTC days flash by. If the zone cannot be
 * detected or stored, the UTC page is shown with `UtcHint`.
 */
export function TimeZoneGate({
  status,
  skeleton,
  children,
}: {
  status: TimeZoneStatus;
  skeleton: ReactNode;
  children: ReactNode;
}) {
  const router = useRouter();
  const [undetected, setUndetected] = useState(false);
  useEffect(() => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
    if (!syncTimeZoneCookie(zone)) {
      if (status === "unresolved") setUndetected(true);
      return;
    }
    router.refresh();
    if (status !== "unresolved") return;
    // Never keep the skeleton for good: should the refresh not arrive, show the UTC page.
    const timer = setTimeout(() => setUndetected(true), REFRESH_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [router, status]);

  if (status === "unresolved" && !undetected) return skeleton;
  const utc = status === "fallback" || (status === "unresolved" && undetected);
  return <UtcContext.Provider value={utc}>{children}</UtcContext.Provider>;
}

/** The PO's hint (#70): shown only when days fall back to UTC. */
export function UtcHint() {
  if (!useContext(UtcContext)) return null;
  return (
    <p className="flex items-start gap-1.5 text-xs text-muted-foreground" role="note">
      <Globe aria-hidden="true" className="mt-px size-3.5 shrink-0" />
      Days are shown in UTC because your time zone couldn't be detected.
    </p>
  );
}
