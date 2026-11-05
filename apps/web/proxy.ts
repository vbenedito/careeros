/**
 * Runs before every matched request (Next.js 16 "proxy", formerly middleware):
 *  1. creates a CSP nonce and the Content-Security-Policy header (SEC-09)
 *  2. refreshes the Supabase session cookies (AUTH-02)
 *  3. protects routes: pages redirect to /sign-in, API routes answer 401 (AUTH-03)
 */
import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { isApiPath, isPublicPath } from "@/lib/auth/routes";
import { publicEnv, siteUrl } from "@/lib/env";
import { buildCsp, createNonce } from "@/lib/security/headers";
import { sessionCookieOptions } from "@/lib/supabase/cookies";

export async function proxy(request: NextRequest) {
  const { supabaseUrl, supabasePublishableKey } = publicEnv();
  const nonce = createNonce();
  const csp = buildCsp({
    nonce,
    isDev: process.env.NODE_ENV === "development",
    supabaseUrl,
    upgradeInsecureRequests: siteUrl().startsWith("https://"),
  });

  // Request headers seen by Server Components: Next.js reads the nonce from the CSP header.
  const forwardedHeaders = () => {
    const headers = new Headers(request.headers);
    headers.set("x-nonce", nonce);
    headers.set("Content-Security-Policy", csp);
    return headers;
  };

  let response = NextResponse.next({ request: { headers: forwardedHeaders() } });
  let cacheHeaders: Record<string, string> = {};

  const supabase = createServerClient(supabaseUrl, supabasePublishableKey, {
    cookieOptions: sessionCookieOptions(),
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request: { headers: forwardedHeaders() } });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        cacheHeaders = headers;
      },
    },
  });

  // Verifies the JWT signature and refreshes the session when it is about to expire.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);
  const { pathname, search } = request.nextUrl;

  let result: NextResponse = response;
  if (!signedIn && isApiPath(pathname)) {
    result = NextResponse.json({ error: "NOT_AUTHENTICATED" }, { status: 401 });
  } else if (!signedIn && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.search = `?next=${encodeURIComponent(`${pathname}${search}`)}`;
    // 303 turns a POST into a GET; 307 would re-send the POST to /sign-in.
    const safeMethod = request.method === "GET" || request.method === "HEAD";
    result = NextResponse.redirect(url, safeMethod ? 307 : 303);
  } else if (signedIn && pathname === "/sign-in") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    result = NextResponse.redirect(url);
  }

  // Keep refreshed/cleared auth cookies and their no-cache headers on whatever we return.
  if (result !== response) {
    for (const cookie of response.cookies.getAll()) result.cookies.set(cookie);
  }
  for (const [key, value] of Object.entries(cacheHeaders)) result.headers.set(key, value);
  result.headers.set("Content-Security-Policy", csp);
  return result;
}

export const config = {
  // Everything except static build assets. Prefetch requests are NOT excluded: a client could
  // otherwise send a prefetch header to skip authentication and the CSP (review of #44).
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
