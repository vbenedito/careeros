import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/env";

/** LAND-07: app pages are not blocked here (they carry noindex); only API and auth routes. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/auth/"] },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
