"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { TZ_COOKIE } from "@/lib/dashboard/time-zone";

const ONE_YEAR_S = 60 * 60 * 24 * 365;

function readCookie(name: string): string | undefined {
  return document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

/**
 * DASH-07: writes the browser's IANA time zone to the `tz` cookie and refreshes the page once
 * when it was missing or different, so the server aggregates days in the viewer's zone.
 */
export function TimeZoneSync() {
  const router = useRouter();
  useEffect(() => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!zone || decodeURIComponent(readCookie(TZ_COOKIE) ?? "") === zone) return;
    // biome-ignore lint/suspicious/noDocumentCookie: a plain, non-sensitive preference cookie
    document.cookie = `${TZ_COOKIE}=${encodeURIComponent(zone)}; path=/; max-age=${ONE_YEAR_S}; samesite=lax`;
    // Refresh only if the write stuck, so a blocked cookie can never cause a reload loop.
    if (decodeURIComponent(readCookie(TZ_COOKIE) ?? "") === zone) router.refresh();
  }, [router]);
  return null;
}
