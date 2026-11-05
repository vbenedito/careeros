import { siteUrl } from "@/lib/env";

/**
 * SEC-08: state-changing routes accept requests only from the dashboard's own origin
 * (CSRF defense on top of SameSite=Lax cookies).
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return origin !== null && origin === siteUrl();
}
