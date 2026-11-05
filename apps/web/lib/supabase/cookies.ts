import type { CookieOptionsWithName } from "@supabase/ssr";
import { siteUrl } from "@/lib/env";

/**
 * AUTH-02: session cookies are HTTP-only (unreadable by page JavaScript, so an XSS cannot steal
 * the refresh token), Secure on https, and SameSite=Lax. @supabase/ssr defaults to
 * httpOnly: false, so this must be set explicitly on every server client. The dashboard has no
 * browser-side Supabase client; all Supabase calls happen on the server.
 */
export function sessionCookieOptions(): CookieOptionsWithName {
  return {
    httpOnly: true,
    secure: siteUrl().startsWith("https://"),
    sameSite: "lax",
    path: "/",
  };
}
