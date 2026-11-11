import type { MetadataRoute } from "next";
import { buildSiteUrl } from "@/lib/env";

/** LAND-07: the public pages only. */
export default function sitemap(): MetadataRoute.Sitemap {
  const site = buildSiteUrl();
  return [
    { url: `${site}/`, changeFrequency: "monthly", priority: 1 },
    { url: `${site}/privacy`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
